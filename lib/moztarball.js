/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Path = require("path");
var Fs = require("fs");
var Tar = require("tar");
var Unzip = require("unzip");
var Zlib = require("zlib");
var Multi = require("multimeter");

var Mozfetcher = require("./mozfetcher");
var Bzip = require("./moztarball/bzip");
var Util = require("./util");

var packer = module.exports = function(unpackDir, multiMeter) {
  unpackDir = Path.normalize(unpackDir || __dirname);
  Mozfetcher.prototype._checkBuildDir.call(this, unpackDir);
  this._unpackDir = unpackDir;
  this._multi = multiMeter;
};

(function() {

var TARBALL_RE = /\.(:?tgz|tar\.gz|tbz2|tar\.bz2)$/i;
var ZIP_RE = /\.zip$/i;
var SUPPORTED_ARCHIVES_RE = /\.(:?tgz|tar\.gz|tbz2|tar\.bz2|zip)$/i;

this.unpack = function(file, callback) {
  var self = this;

  Fs.exists(file, function(exists) {
    if (!exists)
      return callback("path doesn't exist, cannot unpack: " + file);

    // Only unpack supported archive types.
    if (!SUPPORTED_ARCHIVES_RE.test(file))
      return callback("I don't know how to extract '" + Path.basename(file) + "'");

    Util.log("Extracting " + Path.basename(file));
    Fs.stat(file, function(err, stat) {
      if (err)
        return callback(err);

      var input = Fs.createReadStream(file);
      var filesize = stat.size;
      var done = 0;
      var multi, progressBar;
      input.on("data", function(buf) {
        done += buf.length;
        if (progressBar) {
          var p = Math.min(Math.floor((done / filesize) * 100), 100);
          progressBar.percent(p);
        }
      });
      // progress bar:
      if (self._multi) {
        self._multi.drop({width: 72}, function(bar) {
          progressBar = bar;
        });
      }

      var extracter;
      if (TARBALL_RE.test(file)) {
        // Bzip is not a first class member in NodeJS world, yet. :'(
        if (Path.extname(file).indexOf("bz") > -1)
          return Bzip.unpack(input, self._unpackDir, onEnd);

        extracter = Tar.Extract({file: self._unpackDir, strip: 1});

        var transform = Zlib.createGunzip();
        transform.on("error", onEnd);
        input = input.pipe(transform);
      } else if (ZIP_RE.test(file)) {
        extracter = Unzip.Extract({file: self._unpackDir});
      }

      extracter.on("error", onEnd);
      input.pipe(extracter);
      extracter.on("end", onEnd);

      function onEnd(err) {
        if (progressBar) {
          console.log("");
          progressBar.percent(100);
          progressBar = null;
        }
        callback(err);
      }
    });
  });
};

}).call(packer.prototype);
