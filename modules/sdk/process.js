/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* vim:set ts=4 sw=4 sts=4 et: */
/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * Contributor(s):
 *   Mike de Boer <mdeboer@mozilla.com> (Original Author)
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";

const {Ci, Cu} = require("chrome");
const {env: Env} = require("sdk/system/environment");
const {Iterator} = require("api-utils");
const {setImmediate} = require("sdk/timers");

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "GetArgv", "resource://app-bootstrap/cli.js");

const platformMappings = {
  "winnt": "win32"
};

const archMappings = {
  "x86": "ai32",
  "x86_64": "x64",
  "ia64": "x64"
}

// This is a list of common ENV vars, but it is by no means exhaustive. Please
// feel free to add to this list and open a pull request on Github!
const envVars = {
  "CLICOLOR": "CLICOLOR",
  "COMMAND_MODE": "COMMAND_MODE",
  "EDITOR": "EDITOR",
  "GREP_OPTIONS": "GREP_OPTIONS",
  "HOME": "HOME",
  "LANG": "LANG",
  "LC_CTYPE": "LC_CTYPE",
  "LOGNAME": "LOGNAME",
  "LSCOLORS": "LSCOLORS",
  "MANPATH": "MANPATH",
  "OLDPWD": "OLDPWD",
  "PATH": "PATH",
  "PWD": "PWD",
  "SHELL": "SHELL",
  "SHLVL": "SHLVL",
  "SSH_AUTH_SOCK": "SSH_AUTH_SOCK",
  "TERM": "TERM",
  "TMPDIR": ["TMPDIR", "TMP", "TEMP"],
  "USER": "USER"
};

let envCache = null;

const notImplementedYet = function() {
  throw new Error("Not implemented yet!");
};

module.exports = Object.freeze({
  chromeless: true,
  get argv() {
    return GetArgv();
  },

  get execPath() {
    notImplementedYet();
  },

  get execArgv() {
    notImplementedYet();
  },

  cwd: function() {
    return require("app-paths").curDir;
  },

  get env() {
    if (!envCache) {
      envCache = {};
      for (let [name, aliases] of Iterator(envVars)) {
        if (!Array.isArray(aliases))
          aliases = [aliases];
        for (let alias of aliases) {
          if (!(alias in Env))
            continue;
          envCache[name] = Env[alias];
          break;
        }
      }
    }
    return envCache;
  },

  exit: function(code = 0) {
    require("main").AppWindow.close();
  },

  getgid: notImplementedYet,

  setgid: notImplementedYet,

  getuid: notImplementedYet,

  setuid: notImplementedYet,

  getgroups: notImplementedYet,

  setgroups: notImplementedYet,

  initgroups: notImplementedYet,

  get version() {
    return require("appinfo").contents.version;
  },

  get versions() {
    notImplementedYet();
  },

  get config() {
    notImplementedYet();
  },

  get pid() {
    notImplementedYet();
  },

  get title() {
    notImplementedYet();
  },

  get arch() {
    let abi = Services.appinfo.XPCOMABI.split("-")[0].toLowerCase();
    return archMappings[abi] || abi;
  },

  get platform() {
    let platform = Services.appinfo.OS.toLowerCase();
    return platformMappings[platform] || platform;
  },

  memoryUsage: notImplementedYet,

  nextTick: function(callback) {
    if (!callback)
      return;
    setImmediate(callback);
  },

  get maxTickDepth() {
    return Infinity;
  },

  umask: notImplementedYet,

  uptime: function() {
    return Math.floor((Date.now() - require("main").StartTime) / 1000);
  },

  hrtime: function() {
    return require("main").AppWindow._window.performance.now();
  }
});
