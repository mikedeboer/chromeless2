#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Path = require("path");
var Fs = require("fs");
var Async = require("async");
var Mkdirp = require("mkdirp");
var child_process = require('child_process');

var Util = require("../lib/util");
var Mozfetcher = require("../lib/mozfetcher");
var Build = require("../lib/build");
var DepsCheck = require("../lib/depscheck");

var Optimist = require("optimist");
var Manifest = JSON.parse(Fs.readFileSync("package.json", "utf8"));
var argv = Optimist
  .wrap(80)
  .usage("Chromeless v" + Manifest.version + "\n" +
         "Build, run or package an application using the latest Mozilla " +
         "technologies.\nUsage: $0 /path/to/app")
  .alias("b", "build")
  .default("b", true)
  .describe("b", "Build an app for the current OS. Simplest option, as this " +
                 "will not run or create a distributable package.")
  .alias("r", "run")
  .describe("r", "Build & run an app for the current OS. This option will not " +
                 "create a distributable package.")
  .alias("p", "package")
  .describe("p", "Build & package an app for the current OS.")
  .describe("os", "Operating System to build an app for. Possible options are: " +
                  "'windows', 'linux' and 'osx'")
  .default("os", Util.getPlatform())
  .alias("c", "check")
  .describe("c", "Check Build & Package dependencies")
  .alias("h", "help")
  .describe("h", "Show this help message.")
  .alias("v", "verbose")
  .describe("v", "Show verbose logging information.")
  .boolean(["b", "r", "p", "c", "h", "v"])
  .argv;

// Thoroughly sanitize the CLI arguments:
argv = Util.sanitizeArguments(argv);

// Exit handler
function onExit(ex) {
  if (argv.verbose)
    Util.log("Exiting...");
  if (ex) {
    console.trace();
    throw ex;
  }
}
process.on("exit", onExit);
process.on("UncaughtException", onExit);

if (argv.help) {
  console.log(Optimist.help());
  process.exit();
}

function exitWithError(err, code) {
  if (err)
    Util.log(err, "error");
  process.exit(code || 1);
}

// set the "build directory", where we'll output built artifacts, download
// xulrunner, etc.
var buildDir = Path.join(process.cwd(), "build");
// Ensure that the 'build' directory is present.
Mkdirp(buildDir, function(err) {
  if (err)
    exitWithError(err);

  if (argv.check) {
    DepsCheck.check(argv.os.map(function(os) {
      return os.platform;
    }), function(err, results) {
      if (err)
        exitWithError(err);

      DepsCheck.report(results);
      process.exit();
    });
  } else {
    // Each app will be process for each OS specified through the command line.
    // First we'll do a basic check if the app directories exist:
    argv.apps.forEach(function(appPath) {
      // Throw an error message if we can't figure out what html file is the app's
      // HTML entry point
      if (!Fs.existsSync(appPath))
        exitWithError("Can't find app HTML (tried '" + appPath + "')");
    });

    // Then we'll check if the necessary xulrunner is present for all OSes to build:
    Async.eachSeries(argv.os,
      function(os, nextOS) {
        var fetcher = new Mozfetcher(buildDir, os.platform, os.arch);
        // Tack path to the xulrunner executable on `os`, to reuse later in run()!
        os.xulrunnerPath = fetcher.getXulrunnerPath();

        fetcher.fetchIfNeeded(nextOS);
      },
      function(err) {
        if (err)
          exitWithError(err);
        run();
      });
  }
});

function run() {
  // DONE! Alright, now we can finally start doing something interesting...
  var runOptions = {};
  Async.eachSeries(argv.apps,
    function(app, nextApp) {
      Async.eachSeries(argv.os,
        function(os, nextOS) {
          runOptions.os = os;
          runOptions.app  = app;
          runOptions.buildDir  = buildDir;
          Build.appify(os, app, buildDir, argv.verbose, nextOS);
        },
        nextApp);
    },
    function(err) {
      if (err)
        exitWithError(err);
      if (!argv.run) {
        console.log("Finished");
        process.exit();
      }
      runApp(runOptions)
    });
}

function runApp(runOptions) {
  console.log("Start running:" + JSON.stringify(runOptions));
  var finalBinaryPath = runOptions.os.finalBinaryPath;

  var child = child_process.spawn(finalBinaryPath, ['-jsconsole', '-purgecaches'], {
    detached: true,
    env: process.env,
    cwd: Path.dirname(finalBinaryPath),
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', function(data) {
    process.stdout.write(data);
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', function(data) {
    process.stderr.write(data);
  });

  child.on('error', function(err) {
    console.log(err);
  });
}
