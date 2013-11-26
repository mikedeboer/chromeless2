/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ["Packaging"];

this.Packaging = function Packaging(packages, harness) {
  this._packages = packages;
  this._harness = harness;
};

this.Packaging.prototype = {
  _packages: null,
  _harness: null,
  _loader: null,

  setLoader: function(loader) {
    this._loader = loader;
  },

  get root() {
    return rootFileSpec.clone();
  },

  get harnessService() {
    return this._harness;
  },

  get options() {
    return this._harness.options;
  },

  get jetpackID() {
    return this._harness.options.jetpackID;
  },

  get bundleID() {
    return this._harness.options.bundleID;
  },

  getModuleInfo: function getModuleInfo(path) {
    var i = this._packages[path];
    var info = {
      dependencies: i.requires,
      needsChrome: i.chrome,
      'e10s-adapter': i['e10s-adapter'],
      name: i.name,
      packageName: i.packageName,
      hash: i.hash
    };
    if (info.packageName in options.packageData)
      info.packageData = options.packageData[info.packageName];

    return info;
  }
};
