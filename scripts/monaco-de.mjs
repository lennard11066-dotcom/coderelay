import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// Monaco publishes translated strings by numeric index in its AMD build.
// Its ESM build calls localize() with the corresponding English fallback.
export function germanEditor() {
  return {
    name: "monaco-de",
    transform(code, id) {
      if (!id.replaceAll("\\", "/").endsWith("/monaco-editor/esm/vs/nls.js"))
        return;
      const load = (file) =>
        fs.readFileSync(
          require.resolve("monaco-editor/dev/vs/" + file),
          "utf8",
        );
      const context = { define: (_deps, factory) => factory() };
      vm.runInNewContext(load("nls.messages.de.js"), context, {
        timeout: 1000,
      });
      const dictionary = Object.create(null);
      const matches = load("editor/editor.main.js").matchAll(
        /\blocalize2?\)?\(\s*(\d+),\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g,
      );
      for (const [, index, literal] of matches) {
        const translated = context._VSCODE_NLS_MESSAGES[Number(index)];
        if (typeof translated === "string")
          dictionary[vm.runInNewContext(literal)] = translated;
      }
      if (!dictionary["Match Case"])
        throw Error("Deutscher Monaco-Katalog passt nicht zum Editor.");
      return (
        "const translations=" +
        JSON.stringify(dictionary) +
        ";\n" +
        code
          .replace(
            "return _format(message, args);\n}",
            "return _format(translations[message] ?? message, args);\n}",
          )
          .replace(
            "message = originalMessage;",
            "message = translations[originalMessage] ?? originalMessage;",
          )
      );
    },
  };
}
