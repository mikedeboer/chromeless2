/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ["GetArgv"];

const {interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

let argv = [];

this.GetArgv = function() {
  return argv;
};

function CliHandler() {}

CliHandler.prototype = {
  classDescription: "Chromeless Command Line Handler",
  classID: Components.ID("{5f2c73b0-406a-4287-932d-a5e1af4ccb13}"),

  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsICommandLineHandler
  ]),

  handle: function(cmdLine) {
    for (let i = 0; i < cmdLine.length; ++i) {
      argv.push(cmdLine.getArgument(i));
    }
    if (cmdLine.length > 0) {
      cmdLine.removeArguments(0, cmdLine.length-1);
    }
    cmdLine.preventDefault = true;
    //dump("nsICommandLineHandler handle:: " + JSON.stringify(argv) + "\n");
    let ns = {};
    Cu.import("resource://app-bootstrap/app-harness.js", ns);
    this._harness = new ns.AppHarness();
  },

  helpInfo: ""
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([CliHandler]);
