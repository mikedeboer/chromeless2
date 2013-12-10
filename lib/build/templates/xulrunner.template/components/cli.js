/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ["GetArgv"];

const {interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

let done = false;
let argv = [];
let cbQueue = [];

this.GetArgv = function(callback) {
  cbQueue.push(callback);
  processQueue();
};

function processQueue() {
  if (!done)
    return;
  dump("GOT ARGS:: " + JSON.stringify(argv) + "\n");
  let callback;
  while (callback = cbQueue.shift())
    callback(argv);
}

function CliHandler() {}

CliHandler.prototype = {
  classDescription: "Chromeless Command Line Handler",
  classID: Components.ID("{5f2c73b0-406a-4287-932d-a5e1af4ccb13}"),
  contractID: "@mozilla.org/commandlinehandler/general-startup;1?type=chromeless",

  _xpcom_categories: [{
    category: "command-line-handler",
    // CHANGEME:
    // category names are sorted alphabetically. Typical command-line handlers use a
    // category that begins with the letter "m".
    entry: "m-chromeless"
  }],

  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsICommandLineHandler
  ]),

  handle: function(cmdLine) {
    for (let i = 0; i < cmdLine.length; ++i)
      argv.push(cmdLine.getArgument(i));
    done = true;
    processQueue();
  },

  helpInfo: ""
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([CliHandler]);
