import React, { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/editor/contrib/find/browser/findController";
import "monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution";
import "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution";
import "monaco-editor/esm/vs/basic-languages/java/java.contribution";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution";
import "monaco-editor/esm/vs/basic-languages/css/css.contribution";
import "monaco-editor/esm/vs/basic-languages/html/html.contribution";
import "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution";
import Worker from "monaco-editor/esm/vs/editor/editor.worker?worker";
(self as any).MonacoEnvironment = { getWorker: () => new Worker() };
monaco.editor.defineTheme("relay", {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#13151C",
    "editorLineNumber.foreground": "#565e71",
    "editor.lineHighlightBackground": "#1b1e29",
  },
});
const langs: Record<string, string> = {
  java: "java",
  py: "python",
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  md: "markdown",
  html: "html",
  css: "css",
  json: "json",
};
export default function Editor({
  file,
  value,
  onChange,
  onSave,
}: {
  file: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef({ onChange, onSave });
  latest.current = { onChange, onSave };
  useEffect(() => {
    if (!host.current) return;
    const model = monaco.editor.createModel(
      value,
      langs[file.split(".").pop() || ""] || "plaintext",
    );
    const ed = monaco.editor.create(host.current, {
      model,
      theme: "relay",
      automaticLayout: true,
      fontSize: 14,
      lineHeight: 23,
      fontFamily: "Cascadia Code,Consolas,monospace",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 14 },
      tabSize: 4,
    });
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
      latest.current.onSave(),
    );
    ed.onDidChangeModelContent(() => latest.current.onChange(model.getValue()));
    return () => {
      ed.dispose();
      model.dispose();
    };
  }, [file]);
  return <div className="monacoHost" ref={host} />;
}
