/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

var Assert = require("assert");
var Fs = require("fs");
var Path = require("path");
var Defines = require("./../build/defines");

describe("ifdef parser", function() {

  var fixtures = Path.join(__dirname, "fixtures");

  it("should correcly parse OSX ifdefs", function(next) {
    var defines = {
      "XP_OSX": 1
    };
    Defines.parseFile(Path.join(fixtures, "defines.html"), defines, false, function(err, content) {
      Assert.ok(!err);
      Assert.equal(content, Fs.readFileSync(Path.join(fixtures, "defines_result_osx.html"), "utf8"));
      next();
    });
  });

  it("should correcly parse Windows ifdefs", function(next) {
    var defines = {
      "XP_WIN": 1
    };
    Defines.parseFile(Path.join(fixtures, "defines.html"), defines, false, function(err, content) {
      Assert.ok(!err);
      Assert.equal(content, Fs.readFileSync(Path.join(fixtures, "defines_result_win.html"), "utf8"));
      next();
    });
  });

  it("should correcly parse no defines set", function(next) {
    var defines = {};
    Defines.parseFile(Path.join(fixtures, "defines.html"), defines, false, function(err, content) {
      Assert.ok(!err);
      Assert.equal(content, Fs.readFileSync(Path.join(fixtures, "defines_result_other.html"), "utf8"));
      next();
    });
  });

  it("should correctly parse define statements", function(next) {
    Defines.parseFile(Path.join(fixtures, "defines_extra.html"), {}, false, function(err, content) {
      Assert.ok(!err);
      Assert.equal(content, Fs.readFileSync(Path.join(fixtures, "defines_extra_result.html"), "utf8"));
      next();
    });
  });

});
