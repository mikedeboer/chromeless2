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

const {Cc, Ci} = require("chrome");
const {Stream} = require("sdk/io/stream");
const {EventTarget} = require("sdk/event/target");
const {emit} = require("sdk/event/core");
const {Class} = require("sdk/core/heritage");
const {Subprocess} = require("child_process/subprocess");
const {resourcePaths} = require("app-paths");

Subprocess.setWorkerPath("resource://" +
  resourcePaths.filter(path => /[^(:?addon\-)]+\-sdk$/.test(path))[0] +
  "/child_process/");

const kSIGTERM = "SIGTERM";
const kSIGKILL = "SIGKILL";

let processes = [];

const mergeOptions = function(target, overrides) {
  if (overrides) {
    for (let k of Object.keys(overrides)) {
      if (overrides[k] !== undefined)
        target[k] = overrides[k];
    }
  }
  return target;
};

exports.exec = function() {
  var file, args, options, callback;

  if (typeof arguments[1] === 'function') {
    options = undefined;
    callback = arguments[1];
  } else {
    options = arguments[1];
    callback = arguments[2];
  }

  if (process.platform === 'win32') {
    file = 'cmd.exe';
    args = ['/s', '/c', '"' + command + '"'];
    // Make a shallow copy before patching so we don't clobber the user's
    // options object.
    options = mergeOptions({}, options);
    options.windowsVerbatimArguments = true;
  } else {
    file = '/bin/sh';
    args = ['-c', command];
  }
  return exports.execFile(file, args, options, callback);
};

exports.execFile = function() {
  //
};

/**
 * spawn a child process.
 * @param {string} command The command to execute
 * @param {array of strings, or string} args Argument(s) to said command.  If not an array,
 *        will be assumed to be a single argument.
 * @returns A ChildProcess
 */
exports.spawn = function(file, args, options) {
  args = args ? args.slice(0) : [];
  args.unshift(file);

  let env = options ? options.env : {};//) || process.env;
  let envPairs = [];
  for (let key in env)
    envPairs.push(key + "=" + env[key]);

  let child = ChildProcess();
  child.spawn({
    file: file,
    args: args,
    cwd: options ? options.cwd : null,
    windowsVerbatimArguments: !!(options && options.windowsVerbatimArguments),
    envPairs: envPairs,
    customFds: options ? options.customFds : null,
    stdinStream: options ? options.stdinStream : null,
    uid: options ? options.uid : null,
    gid: options ? options.gid : null
  });

  return child;
}

const convertBytes = function(data, charset) {
  let string = "";
  charset = charset || "UTF-8";
  // Special NodeJS idiomatic correction:
  if (charset.toLowerCase() == "utf8")
    charset = "UTF-8";
  const unicodeConv = Cc["@mozilla.org/intl/scriptableunicodeconverter"]
                        .getService(Ci.nsIScriptableUnicodeConverter);
  try {
    unicodeConv.charset = charset;
    string = unicodeConv.ConvertToUnicode(data);
  } catch (ex) {
    throw new Error("String conversion failed: " + ex.toString());
    string = "";
  }
  string += unicodeConv.Finish();
  return string;
};

const ProcessReadStream = Class({
  extends: Stream,
  onDataAvailable: function(data) {
    // Convert data to string if the encoding is set for this Stream.
    if (typeof this.encoding == "string" && this.encoding != "binary") {
      try {
        data = convertBytes(data, this.encoding);
      } catch (ex) {
        emit(this, "error", ex.message);
        return;
      }
    }
    emit(this, "data", data);
  },
  destroy: function() {
    emit(this, "end");
    emit(this, "close");
  }
});

const ProcessDuplexStream = Class({
  extends: Stream,
  destroy: function() {
    //
  }
});

/** @class ChildProcess */
const ChildProcess = Class({
  extends: EventTarget,
  initialize: function() {
    this._internal = null;
    processes.push(this);
  },

  get stdout() {
    if (!this._stdout)
      this._stdout = ProcessReadStream();
    return this._stdout;
  },
  get stderr() {
    if (!this._stderr)
      this._stderr = ProcessReadStream();
    return this._stderr;
  },
  get stdin() {
    if (!this._stdin)
      this._stdin = ProcessDuplexStream();
    return this._stdin;
  },

  /**
   * Asynchronously run a child process
   * @param command The command to execute
   * @param args Arguments to said command
   */
  spawn: function(options) {
    // child.spawn({
    //   file: file,
    //   args: args,
    //   cwd: options ? options.cwd : null,
    //   windowsVerbatimArguments: !!(options && options.windowsVerbatimArguments),
    //   envPairs: envPairs,
    //   customFds: options ? options.customFds : null,
    //   stdinStream: options ? options.stdinStream : null,
    //   uid: options ? options.uid : null,
    //   gid: options ? options.gid : null
    // });
    if (options.stdoutStream)
      this._stdout = options.stdoutStream;
    if (options.stderrStream)
      this._stderr = options.stderrStream;
    if (options.stdinStream)
      this._stdin = options.stdinStream;

    try {
      this._internal = Subprocess.call({
        command: options.file,
        arguments: options.args,
        environment: options.envPairs,
        charset: null, // Set to NULL explicitly to get binary data streaming in.
        workdir: options.cwd,
        //stdin: "some value to write to stdin\nfoobar",
        stdin: stdin => {
          //stdin.write("some value to write to stdin\nfoobar");
          //stdin.close();
        },
        stdout: data => {
          this.stdout.onDataAvailable(data);
        },
        stderr: data => {
          this.stderr.onDataAvailable(data);
        },
        done: result => {
          this.stdout.destroy();
          this.stderr.destroy();
          this.stdin.destroy();
          emit(this, "exit", result.exitCode);
        },
        mergeStderr: false
      });
      if (options.sync) {
        // Wait for the subprocess to terminate this will block the main thread,
        // only do if you can wait that long.
        this._internal.wait();
      }
    } catch (ex) {
      emit(this, "error", ex.message);
    }
  },

  kill: function(sig) {
    if (!this._internal)
      return;
    sig = sig || kSIGTERM;
    try {
      // For a hard kill, 'SIGKILL' must be passed explicitly.
      this._internal.kill(sig == kSIGKILL);
    } catch(ex) {
      emit(this, "error", ex.message);
    }
  }
});

exports.ChildProcess = ChildProcess;
/** @endclass */

require("sdk/system/unload").when(function unload() {
  for (let process of processes)
    process.kill();
});
