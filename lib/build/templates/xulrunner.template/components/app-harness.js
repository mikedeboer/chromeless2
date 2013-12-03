/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ["AppHarness"];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://sdk/console.js");

XPCOMUtils.defineLazyModuleGetter(this, "Packaging", "resource://sdk/packaging.js");
XPCOMUtils.defineLazyServiceGetter(this, "IOService",
  "@mozilla.org/network/io-service;1", "nsIIOService");

this.AppHarness = function AppHarness(options = null) {
  try {
    this.options = options;
    this.load();
  } catch(ex) {
    defaultLogError(ex);
    this.quit("FAIL");
  }
};

this.AppHarness.prototype = {
  _started : false,
  _quitting: false,
  _options : null,
  _rootPath: null,
  _loader  : null,
  _resProto: null,
  _app     : null,

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),

  get options() {
    return this._options;
  },

  set options(val) {
    if (val === null)
      val = getDefaultOptions();
    this._options = val.options;
    this._options.onQuit = val.onQuit || function() {};
    this._options.dump = val.dump || dump;
    this._rootPath = val.rootPath;
    delete val.rootPath;
    this.options.logError = val.logError || defaultLogError;
  },

  get loader() {
    if (!this._loader)
      this._loader = this.buildLoader();
    return this._loader;
  },

  get resourceProtocol() {
    if (!this._resProto) {
      this._resProto = IOService.getProtocolHandler("resource")
                                .QueryInterface(Ci.nsIResProtocolHandler);
    }
    return this._resProto;
  },

  get rootPath() {
    return this._rootPath;
  },

  observe: function(subject, topic, data) {
    switch (topic) {
      case "quit-application-granted":
        this.unload("shutdown");
        this.quit("OK");
        break;
    }
  },

  load: function() {
    if (this._started)
        return;

    this._started = true;
    Services.obs.addObserver(this, "quit-application-granted", true);
    let options = this.options;
    if (!options.mainModule)
      return;

    try {
      let {loader, main} = this.loader;
      this._app = main(loader, options.mainModule);
      if (typeof this._app.main == "function") {
        this._app.main(options, {
          quit: this.quit.bind(this),
          print: options.dump
        });
      }

      // Send application readiness notification.
      const APP_READY_TOPIC = options.jetpackID + "_APPLICATION_READY";
      Services.obs.notifyObservers(null, APP_READY_TOPIC, null);
    } catch (ex) {
      defaultLogError(ex, this.options.dump);
      this.quit("FAIL");
    }
  },

  buildLoader: function(options) {
    let options = this.options;

    for (let name in options.resources) {
      let path = options.resources[name];
      let dir;
      if (typeof path == "string") {
        dir = getDir(path);
      } else {
        dir = this.rootPath.clone();
        path.forEach(part => dir.append(part));
        ensureIsDir(dir);
      }
      let dirUri = IOService.newFileURI(dir);
      this.resourceProtocol.setSubstitution(name, dirUri);
    }

    let packaging = new Packaging(options.manifest);
    let ns = Cu.import(options.loader, {}).Loader;
    //let dump = options.dump;
    let loader = ns.Loader({
      paths: ns.override({}, options.paths),
      globals: {
        packaging: packaging,
        console: Console
      },
      resolve: function(id, base) {
        id = options.mappings[id] || id;
        return ns.resolve(id, base);
      }
    });
    packaging.setLoader(loader);

    ns.loader = loader;
    return ns;
  },

  unload: function(reason) {
    if (!this._started)
      return;

    this._started = false;

    Services.obs.removeObserver(this, "quit-application-granted");

    // Notify the app of unload.
    if (this._app) {
      if (typeof this._app.onUnload == "function") {
        try {
          this._app.onUnload(reason);
        } catch (ex) {
          defaultLogError(ex, this.options.dump);
        }
      }
      this._app = null;
    }

    // Notify the loader of unload.
    if (this._loader) {
      this._loader.unload(reason);
      this._loader = null;
    }

    let options = this.options;
    for (let name in options.resources)
      this.resourceProtocol.setSubstitution(name, null);
  },

  quit: function(status = "OK") {
    if (status != "OK" && status != "FAIL") {
      dump("Warning: quit() expected 'OK' or 'FAIL' as an " +
           "argument, but got '" + status + "' instead.");
      status = "FAIL";
    }

    if (this._quitting)
      return;

    this._quitting = true;

    this.unload("internal-quit");

    if (this.options.onQuit)
      this.options.onQuit(status);
  }
};

function getDefaultOptions() {
  let defaultsDir = Cc["@mozilla.org/file/directory_service;1"]
                      .getService(Ci.nsIProperties)
                      .get("DefRt", Ci.nsIFile);
  let rootFileSpec = defaultsDir.parent;

  // Default options to pass back.
  let options;

  try {
    let env = Cc["@mozilla.org/process/environment;1"]
                .getService(Ci.nsIEnvironment);

    let jsonData;
    if (env.exists("HARNESS_OPTIONS")) {
      jsonData = env.get("HARNESS_OPTIONS");
    } else {
      let optionsFile = rootFileSpec.clone();
      optionsFile.append("harness-options.json");
      if (optionsFile.exists()) {
        let fiStream = Cc["@mozilla.org/network/file-input-stream;1"]
                         .createInstance(Ci.nsIFileInputStream);
        let siStream = Cc["@mozilla.org/scriptableinputstream;1"]
                         .createInstance(Ci.nsIScriptableInputStream);
        fiStream.init(optionsFile, 1, 0, false);
        siStream.init(fiStream);
        let data = new String();
        data += siStream.read(-1);
        siStream.close();
        fiStream.close();
        jsonData = data;
      } else {
        throw new Error("HARNESS_OPTIONS env var must exist.");
      }
    }

    options = JSON.parse(jsonData);

    if ("staticArgs" in options) {
      let dirbase = rootFileSpec.clone();
      options.staticArgs.appBasePath = dirbase.path;
    }
  } catch (e) {
    defaultLogError(e);
    throw e;
  }

  let logFile, logStream;
  if (options.logFile) {
    logFile = Cc["@mozilla.org/file/local;1"]
                .createInstance(Ci.nsILocalFile);
    logFile.initWithPath(options.logFile);

    logStream = Cc["@mozilla.org/network/file-output-stream;1"]
                  .createInstance(Ci.nsIFileOutputStream);
    logStream.init(logFile, -1, -1, 0);
  }

  function print(msg) {
    dump(msg);
    if (logStream && typeof msg == "string") {
      logStream.write(msg, msg.length);
      logStream.flush();
    }
  }

  function logError(e) {
    defaultLogError(e, print);
  }

  return {
    options: options,
    rootPath: rootFileSpec,
    dump: print,
    logError: logError
  };
}

function ensureIsDir(dir) {
  if (!dir.exists() || !dir.isDirectory)
    throw new Error("directory not found: " + dir.path);
}

function getDir(path) {
  let dir = Cc["@mozilla.org/file/local;1"]
              .createInstance(Ci.nsILocalFile);
  dir.initWithPath(path);
  ensureIsDir(dir);
  return dir;
}

function defaultLogError(e, print) {
  if (!print)
    print = dump;

  print(e + " (" + e.fileName + ":" + e.lineNumber + ")\n");
  if (e.stack)
    print("stack:\n" + e.stack + "\n");
}
