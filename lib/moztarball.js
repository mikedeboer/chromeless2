/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Path = require("path");
var Fs = require("fs");
var Tar = require("tar");
var Unzip = require("unzip");
var Zlib = require("zlib");

var ProgressBar = require('progress');

var Bzip = require("./moztarball/bzip");
var Util = require("./util");

var packer = module.exports = function(unpackDir) {
  unpackDir = Path.normalize(unpackDir || __dirname);
  this._checkBuildDir.call(this, unpackDir);
  this._unpackDir = unpackDir;
};

(function() {

var TARBALL_RE = /\.(:?tgz|tar\.gz|tbz2|tar\.bz2)$/i;
var ZIP_RE = /\.zip$/i;
var SUPPORTED_ARCHIVES_RE = /\.(:?tgz|tar\.gz|tbz2|tar\.bz2|zip)$/i;

this._checkBuildDir = function(buildDir) {
  if (!Fs.statSync(buildDir).isDirectory())
    Mkdirp.sync(buildDir);
};

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

      // progress bar:
      var progressBar = new ProgressBar('  Extracting [:bar] :percent :etas', { width:78, total: parseInt(filesize) });
      input.on("data", function(buf) {
        done += buf.length;
        var p = done / filesize;
        progressBar.update(p);
      });

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
        extracter = Unzip.Extract({path: self._unpackDir});
      }

      extracter.on("error", onEnd);
      input.pipe(extracter);
      extracter.on("end", onEnd);
      extracter.on("close", onEnd);

      var ended = false;
      function onEnd(err) {
        // Avoid calling the callback twice.
        if (ended)
          return;
        ended = true;
        if (progressBar) {
          console.log("");
          progressBar.terminate();
        }
        callback(err);
      }
    });
  });
};

}).call(packer.prototype);
