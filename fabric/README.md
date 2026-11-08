# Fabric-Projektvorlage

Gradle Wrapper, Lizenz, Einstellungen und Buildskripte stammen aus dem offiziellen Fabric-Beispielprojekt. Der Generator setzt die projektspezifischen Namen, pinnt Loom 1.19.3 und übernimmt die Fabric-API-Version der jeweiligen Minecraft-Reihe. Mappings kommen über Loom von Mojang. Die generierten Projekte enthalten die CC0-Lizenz der Fabric-Vorlage. Der Gradle Wrapper stammt von Gradle und steht unter Apache-2.0.

| Minecraft | Fabric API | Loader | Laufzeit für Gradle | Java-Ziel |
| --- | --- | --- | --- | --- |
| 1.21.1 | 0.116.17+1.21.1 | 0.20.1 | JDK 25 | 21 |
| 1.21.8 | 0.136.1+1.21.8 | 0.20.1 | JDK 25 | 21 |

Der verschiebbare Beispiel-HUD ist für 1.21.1 implementiert. Im geöffneten Chat die Anzeige mit der linken Maustaste ziehen. Die Position wird beim Loslassen unter `config/<modid>-hud.properties` gespeichert. Weitere Funktionswünsche bleiben als Auftrag in CodeRelay gespeichert und können mit einem freigegebenen Modell umgesetzt werden.

[Fabric-Beispiel 1.21.1](https://github.com/FabricMC/fabric-example-mod/tree/4c47210589a9ff72a6075c8dd1d73315dcc3e010) · [Fabric-Beispiel 1.21.8](https://github.com/FabricMC/fabric-example-mod/tree/8d15369809ce85bc717c61073dfb085d10a1d92b) · [Loom 1.19.3](https://maven.fabricmc.net/net/fabricmc/fabric-loom/1.19.3/) · [Gradle-Lizenz](https://github.com/gradle/gradle/blob/master/LICENSE)
