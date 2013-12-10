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

const {Cu} = require("chrome");

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "GetArgv", "resource://app-bootstrap/cli.js");

/*
 * API from the NodeJS documentation:
 * Event: 'exit'
 * Event: 'uncaughtException'
 * <Signal Events>
 * process.stdout
 * process.stderr
 * process.stdin
 * process.argv
 * process.execPath
 * process.execArgv
 * process.abort()
 * process.chdir(directory)
 * process.cwd()
 * process.env
 * process.exit([code])
 * process.getgid()
 * process.setgid(id)
 * process.getuid()
 * process.setuid(id)
 * process.getgroups()
 * process.setgroups(groups)
 * process.initgroups(user, extra_group)
 * process.version
 * process.versions
 * process.config
 * process.kill(pid, [signal])
 * process.pid
 * process.title
 * process.arch
 * process.platform
 * process.memoryUsage()
 * process.nextTick(callback)
 * process.maxTickDepth
 * process.umask([mask])
 * process.uptime()
 * process.hrtime()
 */

exports.platform = Object.freeze({
  get argv() {
    let ret;
    GetArgv(argv => ret = argv);
    return ret;
  },

  get execPath() {
    //
  },

  get execArgv() {
    //
  },

  cwd: function() {},

  get env() {
    //
  },

  exit: function(code = 0) {},

  getgid: function() {},

  setgid: function(id) {},

  getuid: function() {},

  setuid: function(id) {},

  getgroups: function() {},

  setgroups: function(groups) {},

  initgroups: function(user, extra_group) {},

  get version() {
    //
  },

  get versions() {
    //
  },

  get config() {
    //
  },

  get pid() {},

  get title() {},

  get platform() {},

  memoryUsage: function() {},

  nextTick: function(callback),

  get maxTickDepth() {},

  umask: function(mask) {},

  uptime: function() {},

  hrtime: function() {}
});
