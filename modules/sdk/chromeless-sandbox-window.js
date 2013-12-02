const {Cc, Ci, Cu} = require("chrome");

let gWindows = [];

const ww = Cc["@mozilla.org/embedcomp/window-watcher;1"]
             .getService(Ci.nsIWindowWatcher);
Cu.import("resource://sdk/console.js");

const Observers = require("deprecated/observer-service");

const kXulNs = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const kXhtmlNs = "http://www.w3.org/1999/xhtml";
const kAppInfo = require("sdk/appinfo").contents;

const kMenubar = (typeof kAppInfo.menubar == "undefined" || kAppInfo.menubar) ?
  '<toolbox id="theTopToolbox" style="padding: 0; border: 0; margin: 0;">' +
  '<menubar id="theMenuBar" style="padding: 0; border: 0; margin: 0;">' +
  '</menubar></toolbox>' : "";
const kBlankXul = '<?xml version="1.0"?>' +
                  '<?xml-stylesheet ' + ' type="text/css"?> ' +
                  '<window windowtype="navigator:browser" style="padding: 0; ' +
                  'border: 0; margin: 0; background-color: white;" xmlns:html="' +
                  kXhtmlNs + '" xmlns="' + kXulNs + '">' + kMenubar + '</window>';

function isTopLevelWindow(w) {
  for (let i = 0; i < gWindows.length; i++) {
    if (gWindows[i]._browser && gWindows[i]._browser.contentWindow == w)
      return true;
  }
  return false;
}

const kDefaultNs = "_";

function attachPropertyToWindow(sandbox, propName) {
  console.log("EVALLING: window." + propName + " = " + propName + ";");
  Cu.evalInSandbox("window." + propName + " = " + propName + ";", sandbox);
}

function injectProperties(sandbox, props, ns = kDefaultNs) {
  let type = typeof props;
  if (type == "object") {
    if (ns != kDefaultNs) {
      sandbox[ns] = props;
      attachPropertyToWindow(sandbox, ns);
    }
    for (let propName in props) {
      injectProperties(sandbox, props[propName],
                       (ns == kDefaultNs ? "" : ns + ".") + propName);
    }
  } else {
    if (type == "function")
      sandbox.importFunction(props, ns);
    else
      sandbox[ns] = props;
    if (ns != kDefaultNs)
      attachPropertyToWindow(sandbox, ns);
  }
}

let checkWindows = function(subject, url) {
  if (subject.window.top != subject.window.self) {
    if (isTopLevelWindow(subject.window.parent)) {
      // top level iframe window
      let ifWin = subject.window.self;
      ifWin.wrappedJSObject.eval("window.top = window.self");
      ifWin.wrappedJSObject.eval("window.parent = window.self");
    } else {
      // this is a frame nested underneath the top level frame
      let ifWin = subject.window.self;
      ifWin.wrappedJSObject.eval("window.top = window.parent.top");
    }
  } else if (isTopLevelWindow(subject.window)) {
    // this is application code!  let's handle injection at this point.
    let i;
    for (i = 0; i < gWindows.length; i++) {
      if (gWindows[i]._browser && gWindows[i]._browser.contentWindow == subject.window)
        break;
    }

    if (i < gWindows.length) {
      let wo = gWindows[i];
      // "requiring" the prevent navigation module will install a content policy
      // that disallows changing the root HTML page.
      require("sdk/prevent-navigation");

      if (wo.options.injectProps) {
        let sandbox = Cu.Sandbox(
          Cc["@mozilla.org/systemprincipal;1"]
            .createInstance(Ci.nsIPrincipal)
        );

        sandbox.window = subject.wrappedJSObject;
        injectProperties(sandbox, wo.options.injectProps);
      }
    }
  }
};

Observers.add("content-document-global-created", checkWindows);
Observers.add("chrome-document-global-created", checkWindows);

// Forward in-browser console API calls to ours.
Observers.add("console-api-log-event", function(data) {
  console.dir(data.wrappedJSObject);
  console.fromEvent(data.wrappedJSObject);
});

function Window(options, testCallbacks) {
  let trueIsYes = x => x ? "yes" : "no";

  let features = ["width=" + options.width,
                  "height=" + options.height,
                  "centerscreen=yes"];

  if (options.titleBar == false) features.push("titlebar=no");

  features.push("resizable=" + trueIsYes(options.resizable));
  features.push("menubar=" + trueIsYes(options.menubar));

  /* We now pass the options.url, which is the user app directly
  inserting it in the window, instead using the xul browser element
  that was here. This helped to make the session history work.
  */
  let url = "data:application/vnd.mozilla.xul+xml," + escape(kBlankXul);
  let window = ww.openWindow(null, url, null, features.join(","), null);

  this._id = gWindows.push(this) - 1;
  this._window = window;
  this._browser = null;
  this._testCallbacks = testCallbacks;
  this.options = options;

  window.addEventListener("close", this, false);
  window.addEventListener("DOMContentLoaded", this, false);
}

Window.prototype = {
  handleEvent: function handleEvent(event) {
    switch (event.type) {
      case "close":
        if (event.target == this._window) {
          if (gWindows[this._id])
            delete gWindows[this._id];
          this._window.removeEventListener("close", this, false);
        }
        break;
      case "DOMContentLoaded":
        if (event.target == this._window.document) {
          // update window title
          if (kAppInfo && kAppInfo.name) {
            this._window.document.title = kAppInfo.name;
            console.log(this._window.document.title);
          }

          let browser = this._window.document.createElement("browser");
          browser.setAttribute("id", "main-window");
          browser.setAttribute("disablehistory", "indeed");
          browser.setAttribute("type", "content-primary");
          browser.setAttribute("style", "background:none;background-color:transparent !important");
          browser.setAttribute("flex", "1");
          browser.setAttribute("height", "100%");
          browser.setAttribute("border", "10px solid green");
          event.target.documentElement.appendChild(browser);

          this._browser = browser;
          browser.loadURI(this.options.url);
          if (this._testCallbacks != undefined && this._testCallbacks.onload != undefined) {
             let refthis = this;
             browser.addEventListener("DOMContentLoaded", function() { 
               refthis._testCallbacks.onload();
             }, false);
          }
          let parentWindow = this._window;
          browser.addEventListener("DOMTitleChanged", function(evt){
            if (evt.target.title.trim().length > 0)
              parentWindow.document.title = evt.target.title;
          }, false);
        }
        return false;
    }
  },
  close: function() {
    this._window.close();
  }
};

// require("deprecated/errors").catchAndLogProps(Window.prototype, "handleEvent");

exports.Window = Window;

require("system/unload").when(function() {
  gWindows.slice().forEach(window => window.close());
});

// an internal export.  what's the proper way to prevent browsercode from
// getting at this?
exports.AllWindows = gWindows;
