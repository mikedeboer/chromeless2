/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Path = require("path");

var Util = require("./../../util")

exports.createIconset = function(iconsetPath, baseIcon, sizes, iconsDef, callback) {
  var commands = [];
  sizes.forEach(function(size) {
    var outPath = Path.join(iconsetPath, "icon_" + size + "x" + size + ".png");
    // If an image of the correct size is already supplied, pick that one. If
    // not, we'll fall back to the (usually) high res baseIcon.
    var source = iconsDef[size] ? iconsDef[size] : baseIcon.path;
    commands.push(["sips", ["--resampleWidth", size, source, "--out", outPath]]);
    // Do retina icons too:
    //XXX: for some reason `iconutil` doesn't like working with the retina icons
    //     we generate below. WTF???
    // var retinaSize = size * 2;
    // source = iconsDef[retinaSize] ? iconsDef[retinaSize] : baseIcon.path;
    // outPath = Path.join(iconsetPath, "icon_" + size + "x" + size + "@2x.png");
    // commands.push(["sips", ["--resampleWidth", retinaSize, source, "--out", outPath]]);
  });

  // Use iconutil. This is MacOS only, still searching for a cross-platform
  // utility.
  commands.push(["iconutil", ["-c", "icns", iconsetPath], {cwd: Path.dirname(iconsetPath)}]);

  Util.spawnSeries(commands, callback);
};
