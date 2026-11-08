# CodeRelay

CodeRelay ist eine deutschsprachige Windows-Entwicklungsumgebung mit Monaco-Editor, lokalem Werkzeugdienst und einer pro Projekt freigegebenen Modellstaffel. Dateien liegen im gewählten Projektordner. Aufgaben, Änderungen, Werkzeugaktionen und Übergaben bleiben nach dem Schließen der App in SQLite erhalten.

## Installieren und starten

Den Windows-x64-Installer `release/CodeRelay-Setup-1.0.0-x64.exe` ausführen. Die App benötigt im Betrieb keine separate Node-Installation. Der lokale Build ist unsigniert. Für Projektbefehle müssen die jeweiligen Werkzeuge wie Git, Python, Node oder Java auf dem Rechner verfügbar sein.

Für die Entwicklung unter Windows werden Node.js 24.22.1 und npm benötigt. Im Projektverzeichnis ausführen:

```powershell
npm ci
npm start
```

Zum Bauen und Prüfen:

```powershell
npm test
npm run installer
node scripts/smoke.mjs --packaged
```

Der Installer entsteht im Ordner `release`. Die Sperrdatei legt die npm-Abhängigkeiten fest. Beim ersten Build lädt Electron seine Windows-Laufzeit, electron-builder lädt die passenden Packwerkzeuge. Der CI-Workflow baut den Installer aus einem frischen Checkout. Zeitstempel und Packmetadaten können zwischen Builds variieren.

## Erster Auftrag

1. **Projekt öffnen** wählen. Das kann ein leerer Ordner für eine neue Website, App oder einen Python-Bot sein oder ein bestehendes Git-Projekt. Der Explorer zeigt Dateien im ausgewählten Ordner. Strg+S speichert die aktive Editor-Datei.
2. Unter **Einstellungen → Anbieter** eine Verbindung anlegen. Nach erfolgreicher Prüfung erscheint die Modellliste. Schlüssel sind durch Electrons `safeStorage` mit Windows-DPAPI geschützt.
3. Unter **Modelle** eine Modell-ID und gegebenenfalls eine unterstützte Denkintensität wählen. **Modell prüfen** löst einen echten, gegebenenfalls kostenpflichtigen API-Aufruf ohne Projektdateien aus. **Freigeben** und **Reihenfolge speichern** erlauben die Übertragung des Arbeitskontexts an diese Verbindung. Reihenfolge per Ziehen oder Pfeiltaste ändern.
4. Unter **Berechtigungen** Terminalzugriff und optional ein Projektbudget in USD einstellen. Jede Befehlsausführung zeigt vor dem Start den genauen Befehl samt Arbeitsordner.
5. Den Auftrag rechts beschreiben und mit **Strg+Enter** starten. Unter **Plan** steht der aktuelle Arbeitsplan. **Verlauf** zeigt ausgeführte Aktionen. **Änderungen** enthält Diffs, Wiederherstellungspunkte und Git-Status.
6. Nach einer Pause die Aufgabe rechts auswählen und **Fortsetzen** verwenden. Bei unterbrochenen Befehlen zuerst die Dateien und die angegebene PID kontrollieren, anschließend **Zustand geprüft** wählen. Eine abgeschlossene oder abgebrochene Aufgabe bleibt im Verlauf.

Für eine lokale Vorschau kann das Modell einen bestätigten Serverprozess starten. Im Tab **Build** lässt sich dessen localhost-Adresse im Browser öffnen. Die PID und die Stoppfunktion stehen im Terminal. Bestehende Git-Änderungen bleiben im Arbeitsverzeichnis und Index erhalten. CodeRelay führt beim Öffnen eines Projekts weder Checkout noch Reset durch.

## Fabric-Mod

Den **Fabric-Projektassistenten** öffnen, Modname, ID, Minecraft-Version, Modtyp und Funktionen angeben. Nach Auswahl des übergeordneten Ordners entsteht ein neues Projekt mit Wrapper, Java-Quellcode, Metadaten und Ressourcen. Der Beispielauftrag ist:

> Erstelle eine Fabric-Mod mit einem verschiebbaren HUD, das Koordinaten und FPS anzeigt.

Für 1.21.1 kann der fertige HUD-Beispielcode direkt eingefügt werden. Weitere Funktionswünsche erscheinen als fortsetzbarer Auftrag. Vorhandene Fabric-Mods werden über **Projekt öffnen** bearbeitet. Gradle mit Loom 1.19.3 benötigt ein JDK 25. Die generierte Mod verwendet Java-21-Bytecode.

```powershell
# Im generierten Modordner, mit JAVA_HOME auf JDK 25
.\gradlew.bat build
.\gradlew.bat runClient
```

Die verwendbare Datei liegt in `build/libs/<modid>-1.0.0.jar`. **Mod-JAR anzeigen** öffnet den Speicherort. Minecraft in der passenden Version mit Fabric Loader und der im generierten README benannten Fabric API starten. Beide Mod-JARs in den mods-Ordner legen. Zum Prüfen des Beispiels eine Welt betreten, Koordinaten und FPS ablesen, Chat öffnen, HUD ziehen und nach einem Neustart seine Position prüfen.

Der automatisierte Beispielbuild ist mit `npm run test:fabric` reproduzierbar. Details zu Versionen und Vorlagen stehen in [fabric/README.md](fabric/README.md).

## Anbieter, Speicherung und Übergaben

Einmal konfigurierte Verbindungen stehen in der App zur Verfügung. Für jedes Projekt wird die Freigabeliste separat gespeichert. Für OpenAI, Claude und Gemini wird ein eigener API-Zugang genutzt. Ein Chat-Abonnement allein stellt der App keinen API-Schlüssel bereit. OpenAI-kompatible Dienste benötigen Modellliste und Streaming mit Funktionsaufrufen. Lokales Ollama ist über seinen kompatiblen Endpunkt erreichbar.

Die SQLite-Datenbank `workspace.sqlite` liegt im Electron-Benutzerdatenordner, unter Windows normalerweise `%APPDATA%\CodeRelay`. Sie enthält private Arbeitsstände und Checkpoints und gehört nicht ins Projekt-Repository. API-Schlüssel werden dort ausschließlich als DPAPI-Chiffretext gehalten. Der Renderer erhält nur den Verbindungsstatus. Chatverläufe und Projektdateien sind normale lokale Nutzerdaten.

Details zu Fehlerklassen, Schlüsselverwaltung, Kontext, Kosten und Grenzen stehen in [docs/arbeitsweise.md](docs/arbeitsweise.md).

## Eigene Projekte auf GitHub veröffentlichen

Git und die offizielle GitHub CLI installieren und in einem Terminal `gh auth login --hostname github.com` ausführen. Projekte mit eigenen Workflowdateien können zusätzlich den GitHub-Berechtigungsumfang `workflow` benötigen. CodeRelay liest keinen GitHub-Token aus. Die GitHub CLI verwaltet die Anmeldung.

Im geöffneten Projekt das GitHub-Symbol in der linken Leiste wählen. Repositoryname und Sichtbarkeit angeben, dann **Upload-Vorschau prüfen**. Angezeigt werden Zielkonto, Zielname und die Liste der neuen Dateien. **Jetzt veröffentlichen** erstellt einen neuen Stand in einem neuen Repository. Dateien werden vor dem Upload nochmals anhand ihrer Prüfsumme abgeglichen. Der lokale Git-Verlauf wird nicht mitveröffentlicht. Bestehende gleichnamige Repositories führen zu einem Fehler. Nach dem Push vergleicht CodeRelay die Remote-SHA mit dem lokalen Export-Commit. Falls nur das Anlegen des Repositories gelungen ist, meldet die CLI den Push-Fehler. Der Remote-Stand muss dann im GitHub-Konto geprüft werden.

## Architektur und Abnahme

- `ui/` enthält die React-/TypeScript-Oberfläche und den lokal gebündelten Monaco Editor.
- `desktop/main.mjs` verbindet Fenster, Dateiauswahl und geprüfte IPC-Operationen. Der Renderer hat weder Node-Zugriff noch direkten Anbieterzugriff.
- `desktop/providers.mjs` enthält die echten HTTP-Anbindungen. `relay.mjs` verwaltet Aufgaben, Kontingente und Übergaben. `actions.mjs`, `files.mjs` und `checkpoint.mjs` verwalten Werkzeugaktionen und Wiederherstellung.
- `desktop/schema/` enthält versionierte SQLite-Migrationen. `tests/` enthält simulierte Anbieter und lokale HTTP-Gegenstellen für Fehlertests.
- `.github/workflows/windows.yml` prüft die Tests, baut den Installer, öffnet die gepackte App und baut das HUD-Beispiel.

Lokal geprüft wurden Modellübergaben, gemeinsame Kontingente, Unterbrechungen, Wiederanlauf, Duplikatschutz, Projektgrenzen, Kostenlimits, Uploadfilter und das Speichern im echten Monaco Editor. Die Protokolltests verwenden simulierte Antworten. Live-Aufträge gegen bezahlte Cloudmodelle und eine Funktionsprüfung im laufenden Minecraft-Spiel benötigen einen eingerichteten Zugang bzw. eine Spielsitzung.

## Produktname

Der sichtbare Produktname stammt aus `package.json → productName`. Das Logo liegt unter `assets/`. Für eine Umbenennung außerdem App-ID, Installername und Dokumentation anpassen. Dokumentierte Namensalternativen sind **ModelForge** für Softwareentwicklung mit mehreren Modellen, **DevFlow** für einen durchgehenden Programmierablauf und **CodePilot Studio** für eine KI-gestützte Entwicklungsumgebung. Die Verfügbarkeit von Marken oder Domains wurde nicht geprüft.
