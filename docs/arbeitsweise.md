# Anbieter und Aufgabenübergabe

## Verbindungen und Fähigkeiten

| Verbindung | Modellliste | Generierung |
| --- | --- | --- |
| OpenAI | GET /v1/models | Responses API, gestreamte Function Calls |
| Anthropic | GET /v1/models mit Cursor | Messages API mit tool_use-Blöcken |
| Gemini | GET /v1beta/models mit Seitentoken | streamGenerateContent mit Function Declarations |
| Kompatible Dienste | GET /models relativ zum Endpunkt | Chat Completions mit gestreamten Tool Calls |
| Ollama | Kompatible Modellliste unter /v1 | Lokale Chat Completions |

Statische Informationen sind auf dokumentierte Modelle begrenzt. Für `gpt-6-astra` enthält der Katalog den Anzeigenamen, Bildunterstützung, Kontextfenster, Basispreise und dokumentierte Denkintensitäten. Die Funktionserprobung prüft Modell und Intensität in genau dieser Verbindung. Für andere Modelle zeigen die Modelllisten die vom Anbieter gelieferten Daten. Eine manuell eingegebene ID benötigt denselben realen Funktionstest. Für unbekannte Fähigkeiten erscheint „Nicht verfügbar“. Ein Test kann auch bei einem grundsätzlich geeigneten Modell scheitern, wenn es den angeforderten Prüfaufruf nicht liefert.

Die Anfragen verwenden je einen eigenständigen Arbeitsschritt mit dem persistierten Aufgabenstand. Erwartet wird ein vollständig abgeschlossener nativer Aufruf von `relay_action`. Die Anwendung wartet auf das protokollspezifische Abschlussereignis. Unvollständige JSON-Argumente, abgeschnittene Antworten und mehrere parallele Aktionen führen zu keiner Werkzeugausführung.

[OpenAI Function Calling](https://developers.openai.com/api/docs/guides/function-calling) · [OpenAI-Modellkarte für GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra) · [Anthropic Tool Use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works) · [Gemini Generate Content](https://ai.google.dev/api/generate-content) · [Ollama-Kompatibilität](https://docs.ollama.com/api/openai-compatibility)

## Übergaben

Der Projektkontext umfasst den ursprünglichen Auftrag, Plan, letzte Ereignisse und das Werkzeugjournal mit Schritt-IDs, Pfaden, Ergebnissen, PIDs und Diffs. Ältere Ausgaben werden gekürzt. Der vollständige gespeicherte Dateiinhalt bleibt über das lokale Lesewerkzeug zugänglich. Dateiinhalte und Terminalausgaben werden als Projektdaten gekennzeichnet. Es werden keine internen Gedankengänge für die Übergabe benötigt.

| Ereignis | Verhalten |
| --- | --- |
| Temporäres Ratenlimit | Höchstens zwei Wiederholungen mit Wartezeit. Längeres Retry-After sperrt die Kontingentsgruppe sofort. |
| Kontingent oder Guthaben erschöpft | Gesamte Gruppe überspringen. Ohne Anbieterzeit bleibt die lokale Sperre bis „Kontingent erneut versuchen“ bestehen. |
| Serverfehler oder Timeout | Begrenzte Wiederholungen, dann nächste freigegebene Verbindung. |
| Ungültige Zugangsdaten | Fehler protokollieren und anderes freigegebenes Modell versuchen. |
| Kontext zu groß | Einmal kompakteren Kontext senden, dann gegebenenfalls wechseln. |
| Inhaltsablehnung | Aufgabe pausieren. Es erfolgt keine Übergabe. |
| Alle Modelle verbraucht | Zustand speichern und mit Erklärung pausieren. |

Eine gemeinsame Kontingentsgruppe bedeutet ein gemeinsames Konto oder Anbieterprojekt. Standardmäßig teilen Verbindungen zum gleichen Anbieter-Endpunkt die Gruppe. Für unterschiedliche Endpunkte mit gemeinsamem Budget denselben Gruppennamen setzen. Die interne Schutzwartezeit nach einem Ratenlimit ohne Retry-After ist eine lokale Entscheidung. CodeRelay stellt sie nicht als vom Anbieter genannte Rücksetzzeit dar. Je Lauf sind höchstens 80 Modellschritte erlaubt.

## Dauerhafte Aktionen und Prozesse

Jede Aktion erhält eine lokale UUID und eine stabile Schritt-ID innerhalb der Aufgabe. Der Eintrag wird vor der Wirkung geschrieben. Änderungen benötigen den erwarteten Vorzustand. Schreibvorgänge verwenden eine temporäre Datei im Zielverzeichnis und anschließendes Umbenennen. Beim Wiederanlauf werden Vor- und Nachzustand mit dem wirklichen Dateiinhalt verglichen. Bei unklarem Stand fordert die App eine Prüfung im Verlauf. Ein erneut gelieferter abgeschlossener Schritt wird aus dem Journal beantwortet. Identische Befehle mit neuer ID werden ohne zwischenzeitliche Dateiaktion zusammengeführt.

Die Shell startet im ausgewählten Projekt. Freigegebene Befehle können auf das Netzwerk und auf andere Dateien des Windows-Benutzers zugreifen. Die Umgebung übernimmt ausgewählte Systempfade einschließlich JAVA_HOME. Anbieter-API-Schlüssel werden dem Kindprozess nicht als Umgebungsvariablen übergeben. Dateipfade mit Traversierung, Verknüpfungen, Gerätesondernamen und geschützte Dateien werden von den Dateiwerkzeugen abgelehnt.

Vor Befehlen wird ein Wiederherstellungspunkt lesbarer UTF-8-Projektdateien erstellt, mit höchstens 1 MiB pro Datei und 16 MB pro Punkt. Binärdateien, Abhängigkeiten, Buildausgaben und erkennbare Geheimnisse sind ausgeschlossen. Im Tab **Änderungen** kann ein einzelner gesicherter Dateiinhalt wiederhergestellt werden. Dateiwerkzeugänderungen besitzen gesonderte Diffs und Vorzustände. Eine Wiederherstellung über einen Diff verlangt den erwarteten Nachzustand. Für externe Nebenwirkungen eines Befehls ist der Checkpoint keine vollständige Sicherung.

CodeRelay zeigt laufende PIDs an. Beim Abbrechen versucht die App, gestartete Prozessbäume zu stoppen. Nach einem Absturz wird eine möglicherweise wiederverwendete PID nicht automatisch beendet. Der Nutzer prüft sie und mögliche Nebenwirkungen vor der Fortsetzung.

## Schlüssel und Kosten

Für gespeicherte API-Schlüssel verwendet Electron den Windows-Schlüsselschutz. Ressourcenzugriff aus dem Renderer erfolgt ausschließlich über die kleine Preload-/IPC-Schnittstelle. Reguläre Projektdateien, Chattexte, Terminalausgaben und Exportdateien werden auf eingerichtete Schlüssel und typische Schlüsselmuster geprüft. Frei formulierte Geheimnisse in Projekten lassen sich nicht zuverlässig automatisch erkennen.

Vor jedem Aufruf reserviert die App einen konservativen Schätzbetrag im Projektjournal. Grundlage sind UTF-8-Eingabegröße, Protokollzuschlag, das Ausgabe-Limit von 4.096 Token und verfügbare Preise. Erfolgreich gemeldeter Verbrauch ersetzt die Reservierung. Nach unterbrochenen oder fehlgeschlagenen Anfragen kann die Reservierung als Schätzung bestehen bleiben. Bei unbekannten Preisen oder bereits unbezifferter Nutzung sperrt ein aktives Budget weitere Anfragen. Katalogpreise beziehen sich auf den Standardtarif. Die Oberfläche erlaubt manuelle Schätzpreise für andere Modelle. Lokale Ollama-Anfragen am Loopback-Endpunkt haben geschätzte API-Kosten von null. Gerätelaufzeit und Stromkosten sind darin nicht enthalten.

[Electron safeStorage unter Windows](https://www.electronjs.org/docs/latest/api/safe-storage) · [OpenAI-Preise und Langkontextstaffel](https://developers.openai.com/api/docs/models/gpt-6-astra)
