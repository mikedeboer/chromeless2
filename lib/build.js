
exports.package = function(build_dir, multi, callback) {
  callback();
};

// Generate a complete standalone application (inside of a folder). The output
// will be placed in build/ directory and the path to the application will be
// returned.
exports.appify = function(build_dir, browser_code, harness_options, multi, callback) {
  callback();
};

// Generate a xul application (a directory with application.ini and other stuff).
// The application will be placed in the build/ directory and the path to it
// will be returned.
exports.outputXulApp = function(callback) {
  //
};
