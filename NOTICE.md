# Notice

OpenRath, a free home screen for Android car stereos. This is the React Native (Expo) edition,
built from OpenRath 1.43; the Android (Java) version it is ported from is at the link below.

Copyright (C) Manish Shekhawat and the OpenRath contributors.

OpenRath is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See `LICENSE` for the full text (SPDX: GPL-3.0-or-later).

## Additional term: credit

Under section 7(b) of the GNU GPL version 3, anyone who conveys OpenRath or a modified version of it must keep the author attribution "Based on OpenRath by Manish Shekhawat", with a link to https://github.com/manishekhawat/OpenRath, in its About or credits screen, or in its documentation if it has no such screen. This is the only additional term; everything else is the plain GPL.

## Third-party parts

These are bundled in the source or in the app. Each keeps its own licence, and the licence texts are in `LICENSES/` (and beside the files in `assets/map/`).

| Part | Where | Copyright | Licence |
| --- | --- | --- | --- |
| Leaflet 1.9.4, the map library | `assets/map/leaflet.js`, `leaflet.css` | Volodymyr Agafonkin, CloudMade | BSD-2-Clause (`LICENSES/Leaflet-BSD-2-Clause.txt`, `assets/map/LEAFLET-LICENSE`) |
| leaflet-rotate, map turning for Leaflet | `assets/map/leaflet-rotate.js` | Iván Sánchez Ortega (author), Raruto, Fabien Nicollet and Zsolt Ero (github.com/Raruto/leaflet-rotate) | GPL-3.0 (`LICENSES/leaflet-rotate-GPL-3.0.txt`, `assets/map/LEAFLET-ROTATE-LICENSE`) |
| QR code generator for JavaScript, for the QR codes on the map page | `assets/map/qrcode.js` | Kazuhiko Arase | MIT (`LICENSES/qrcode-generator-MIT.txt`) |
| qrcode-generator, for the QR codes the screens show | npm package `qrcode-generator` | Kazuhiko Arase | MIT (`LICENSES/qrcode-generator-MIT.txt`) |
| fflate, the zip reader and writer for backups, theme packs and boot animations | npm package `fflate` | Arjun Barrett | MIT (in the package) |
| React Native, Expo and the Expo modules | npm packages, see `package.json` | Meta Platforms, Expo and contributors | MIT (in each package) |
| Inter and Inter Display fonts, used to draw the picture layouts' artwork | Taken from the `fonts-inter` package when the artwork is drawn | The Inter Project Authors | SIL Open Font License 1.1 (`LICENSES/Inter-OFL-1.1.txt`) |

"QR Code" is a registered trademark of DENSO WAVE INCORPORATED.

### Map data and online services

Map pictures, places and roads come from online services while the app runs. They are not part of the source or the app.

- Map data © OpenStreetMap contributors, under the Open Database License (ODbL). Used through tile.openstreetmap.org, Overpass API, Photon, Nominatim and OSRM.
- The dark map tiles are © Esri and its data providers (Esri, HERE, Garmin, OpenStreetMap contributors).
- Weather and air quality by Open-Meteo.com (CC BY 4.0).
- Online radio stations are listed by radio-browser.info.

The map page shows the attributions these services ask for. See `PRIVACY.md` for what each service receives.

## Trademarks

Car makers' names, badges and logos, and stereo makers' names, belong to their owners. They are used in OpenRath only to say which car or stereo something is for. OpenRath is not affiliated with, endorsed by or sponsored by any car maker or stereo maker.

Car makers' badges are never part of OpenRath's source or of the builds it publishes; this edition ships no brand badges at all.

"OpenRath" and the chariot-wheel mark are the project's own name and logo.
