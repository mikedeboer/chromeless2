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
 *   Mike de Boer <mdeboer@mozilla.com> (Original author)
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

const {Cc, Ci, Cr} = require("chrome");
const {Class} = require("sdk/core/heritage");
const utils   = require("api-utils");
const hotkeys = require("hotkey");
const kNSXUL  = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

function mixin(obj, mixin) {
  for (let key in mixin)
    obj[key.toLowerCase()] = mixin[key];
};

/*
 * Sets the parentNode of a Menu, SubMenu or Seperator instance and its children.
 * When a parentNode is set that is already appended to a rooted XUL node, the
 * item may be drawn on 'canvas' as well. This is an implementation of lazy 
 * rendering.
 * Each instance of Menu, SubMenu and Seperator have this function set as member
 * property.
 *
 * @param {mixed} parent Parent node, which may be a XULElement, Menu or SubMenu
 * @type  {void}
 * @private
 */
function setParent(parent) {
  if (!parent)
    return;

  if ((parent instanceof Menu || parent instanceof SubMenu) && parent.node) {
    // An instance of 'Menu' or 'SubMenu' was passed in.
    this.parentNode = parent.node;
  } else if (parent.documentElement) {
    // Assume it's a (hidden) document.
    let menu = parent.documentElement.appendChild(parent.createElement("menu"));
    this.parentNode = menu.appendChild(parent.createElement("menupopup"));
  } else if (parent.ownerDocument) {
    // A regular (DOM)Node is passed in.
    this.parentNode = parent;
  } else {
    return;
  }

  // We now have a parentNode, so we can draw something!
  this.draw();

  if (this.length) {
    for (let i = 0, l = this.length; i < l; ++i)
      this[i].setParent && this[i].setParent(this);
  }

  this.parent = parent;

  if (this.children && this.children.length)
    this.children.setParent(this);
}

function commandHandler(e) {
  if (!e && "checkbox|radio".indexOf(this.type) > -1) {
    this.checked = !this.checked;
    this.node.setAttribute("checked", this.checked);
  }

  if (this.onclick)
    this.onclick(e);
}

/**
 * @class Menu
 * Represents any single menu item that should be displayed
 * with at least a label.
 *
 * Example:
 *
 *     var ui   = require("ui"),
 *         menu = require("menu");
 *
 *     var file = menu.Menu({
 *         parent: ui.getMenu(),
 *         label: "File",
 *         children: [
 *             menu.Menu({
 *                 label: "New Window",
 *                 hotkey: "accel-n",
 *                 type: "radio",
 *                 checked: true,
 *                 onClick: function(e) {
 *                     alert("yay!");
 *                 }
 *             }),
 *             menu.Menu({
 *                 label: "New Tab",
 *                 children: [
 *                     menu.Menu({ label: "In the current window" }),
 *                     menu.Menu({ label: "In a new window" }),
 *                 ]
 *             })
 *         ]
 *     });
 */
/*
 * @constructor
 * @param {object} struct a set of options/ properties that will be set on the 
 *                        menu item. Keys are case-insensitive.
 * @type  {Menu}
 */
const Menu = Class({
  initialize: function(struct) {
    this.node = null;
    this.parentNode = null;
    mixin(this, struct);
    this.children = this.children && this.children.length ? this.children : [];

    if (this.children.length) {
      // verify proper mutual exclusivity
      let offending = ["hotkey", "image", "enabled", "onclick", "name"].filter(f => {
        return typeof this[f] != "undefined";
      });
      if (offending.length > 0) {
        throw new Error("menuitems with children may not also have: '" +
                        offending.join("' nor '") + "'");
      }
    }

    this.children = new SubMenu(this.children, this);
    setParent.call(this, this.parent);

    let propMap   = {
      hotkey: "key"
    };

    let props = {
      label: this.label,
      hotkey: this.hotkey,
      image: this.image,
      type: this.type,
      checked: this.checked,
      autocheck: this.autocheck,
      disabled: this.disabled,
      name: this.name
    };

    for (let prop of Object.getOwnPropertyNames(props)) {
      let propToDefine = prop;
      Object.defineProperty(this, propToDefine, {
        get: () => props[propToDefine],
        set: val => {
          props[propToDefine] = val;
          if (!this.node || this.children.length)
            return;
          if (["checked", "autocheck", "name"].indexOf(propToDefine) !== -1 &&
              "checkbox|radio".indexOf(val) === -1) {
            return;
          }
          if (propToDefine == "hotkey")
            return this.setHotkey();

          this.node.setAttribute(propMap[propToDefine] || propToDefine, val);
        }
      });
    }
  },

  /**
   * @function draw
   * Draw a menu element to the canvas (a XUL document)
   * Usually this function is invoked by setParent()
   * 
   * @type {void}
   */
  draw: function() {
    if (this.node)
      return;

    // generate a menu and a menu popup
    let hasChildren = this.children.length;
    this.node = this.parentNode.ownerDocument.createElementNS(kNSXUL, hasChildren ? "menu" : "menuitem");
    this.node.className = hasChildren ? "menu-iconic" : "menuitem-iconic";
    this.node.setAttribute("label", this.label);
    this.parentNode.appendChild(this.node);

    if (hasChildren) {
      this.children.setParent(this);
    } else {
      if (this.hotkey)
        this.setHotkey();
      if (this.image)
        this.node.setAttribute("image", this.image);
      if (this.disabled)
        this.node.setAttribute("disabled", this.disabled);
      if (this.type) {
        this.node.setAttribute("type", this.type);
        if (this.checked)
          this.node.setAttribute("checked", this.checked);
        if (this.autocheck)
          this.node.setAttribute("autocheck", this.autocheck);
        if (this.name)
          this.node.setAttribute("name", this.name);
      }
      this.node.addEventListener("command", commandHandler.bind(this), true);
    }
    return this.node;
  },

  /**
   * @function redraw
   *
   * Redraws a menu element to the canvas (a XUL document) if needed.
   * Usually called called by a function that performs a mutation on a SubMenu
   * (like `push()`, `shift()` or `splice()`).
   * 
   * @type {void}
   */
  redraw: function() {
    if (!this.node)
      return this.parent && this.parent.node ? this.setParent(this.parent) : null;
    let hasChildren = this.children.length;
    if (!hasChildren || (hasChildren && this.node.tagName.toLowerCase() == "menu"))
      return; // no redraw needed, already the right setup!

    this.parentNode.removeChild(this.node);
    this.node = null;
    this.hotkey = this.image = this.disabled = this.type =
      this.checked = this.autocheck = this.name = null;
    this.draw();
  },

  /**
   * @function setHotKey
   * Register a globally accessible hotkey for this menu item that invokes 
   * the 'onClick' handler if set when the key combination is pressed.
   * @see this.hotkey property
   * 
   * @type {void}
   */
  setHotkey: function() {
    if (!this.node || this.children.length || !this.hotkey)
      return;

    let id = "menu_" + utils.getUUID();
    hotkeys.register(this.hotkey, commandHandler.bind(this), id);
    this.node.setAttribute("key", id);
  },

  /**
   * @function destroy
   *
   * Removes a menu item from the canvas (a XUL document) and does basic 
   * garbage collection.
   *
   * @type {void}
   */
  destroy: function() {
    if (!this.node)
      return;
    if (this.children.length)
      this.children.destroy();
    this.parentNode.removeChild(this.node);
    delete this.node;
    this.node = null;
  },

  /**
   * @function setParent
   * @see #setParent()
   */
  setParent: setParent
});
/** @endclass */

/**
 * @class SubMenu
 * Represents a collection of menu items and separators that
 * should be displayed. A SubMenu is defined with the 'children' property of a 
 * Menu object as an Array. Therefore, array-like functions may be used to alter
 * the contents of a SubMenu instance.
 * There is no maximum set to the amount or level of depth of submenus.
 *
 * Example:
 *
 *     var ui   = require("ui"),
 *         menu = require("ui/menu");
 * 
 *     var file = new menu.Menu({
 *         parent: ui.getMenu(),
 *         label: "File",
 *         children: [
 *             new menu.Menu({
 *                 label: "New Window",
 *                 hotkey: "accel-n",
 *                 type: "radio",
 *                 checked: true,
 *                 onClick: function(e) {
 *                     alert("yay!");
 *                 }
 *             }),
 *             new menu.Separator()
 *         ]
 *     });
 *     file.children.splice(0, 1);
 *     file.children.splice(-1, 0, new menu.Menu({ label: "About..." }));
 */
/** 
 * @constructor
 * @param {Array} nodes  a set of options/ properties that will be set on the 
 *                        menu item. Keys are case-insensitive.
 * @param {Menu}  parent parent Menu instance that will show the SubMenu when hovered
 * @type  {SubMenu}
 */
let struct = {
  initialize: function(nodes, parent) {
    this.node = null;
    this.parent = parent;
    this.parentNode = null;

    this.length = 0;
    setParent.call(this, parent);
    this.push.apply(this, nodes);
  },

  /**
   * @function draw
   * Draw a submenu element to the canvas (a XUL document)
   * Usually this function is invoked by setParent()
   * 
   * @type {void}
   */
  draw: function() {
    if (this.node || !this.parent.node)
      return;

    this.node = this.parentNode.ownerDocument.createElementNS(kNSXUL, "menupopup");
    this.parentNode.appendChild(this.node);
    return this.node;
  },

  /**
   * @function destroy
   * Removes a submenu from the canvas (a XUL document), including its children
   * and does basic garbage collection.
   * 
   * @type {void}
   */
  destroy: function() {
    if (!this.node)
      return;
    this.parentNode.removeChild(this.node);
    // make sure to destroy leafs too:
    for (let i = 0, l = this.length; i < l; ++i) {
      this[i].detroy();
      --this.length;
      delete this[i];
    }
    this.node = null;
  },

  /**
   * @function push
   * Adds one or more elements to the end of an array and returns the new 
   * length of the array.
   */
  push: function(...args) {
    for (let arg of args) {
      this[this.length] = arg;
      ++this.length;
      arg.setParent(this);
    }
    if (this.parent.redraw)
      this.parent.redraw();
    return this.length;
  },

  /**
   * @function toArray
   * Convert this SubMenu instance to an Array-representation.
   *
   * @type {array}
   */
  toArray: function() {
    let mock = [];
    for (let i = 0, l = this.length; i < l; ++i)
      mock.push(this[i]);
    return mock;
  },

  /**
   * @function fromArray
   * (re-)Construct this SubMenu instance with Menu or Separator instances
   * from array.
   *
   * @param {array} arr an array of Menu or Separator instances.
   * @type  {void}
   */
  fromArray: function(arr) {
    let i, l, el, next;
    for (i = 0, l = this.length; i < l; ++i) {
      if (arr.indexOf(this[i]) > -1)
        this[i].destroy();
      delete this[i];
    }
    this.length = 0;
    this.push(...arr);
  },

  /**
   * @function setParent
   * @see #setParent()
   */
  setParent: setParent
};

/** @function reverse */
/** @function shift */
/** @function sort */
/** @function splice */
/** @function unshift */
["reverse", "shift", "sort", "splice", "unshift"].forEach(function(func) {
  struct[func] = function(...args) {
    let els = this.toArray();
    els[func](...args);
    this.fromArray(els);
  };
});

const SubMenu = Class(struct);
/** @endclass */

/**
 * @class Separator
 * Represents any single menu item that should be displayed 
 * with as separator (straight horizontal line).
 * Example:
 * 
 *     var ui   = require("ui"),
 *         menu = require("ui/menu");
 * 
 *     var file = new menu.Menu({
 *         parent: ui.getMenu(),
 *         label: "File",
 *         children: [
 *             new menu.Separator(),
 *             new menu.Separator(),
 *             new menu.Menu({
 *                 label: "More Separators!",
 *                 children: [
 *                     new menu.Separator(),
 *                     new menu.Separator(),
 *                 ]
 *             })
 *         ]
 *     });
 */
/**
 * @constructor
 * @param {Menu/SubMenu} parent parent Menu or SubMenu instance that will contain 
 *                              the separator
 * @type  {Separator}
 */
const Separator = Class({
  initialize: function(parent) {
    this.node = null;
    this.parentNode = null;
    this.label = "-";
    setParent.call(this, parent);
  },

  /**
   * @function draw
   * Draw a separator element to the canvas (a XUL document)
   * Usually this function is invoked by setParent()
   * 
   * @type {void}
   */
  draw: function() {
    if (this.node)
      return;
    this.node = this.parentNode.appendChild(
      this.parentNode.ownerDocument.createElementNS(kNSXUL, "menuseparator"));
    return this.node;
  },

  /**
   * @function destroy
   * Removes a separator item from the canvas (a XUL document) and does basic 
   * garbage collection.
   * 
   * @type {void}
   */
  destroy: function() {
    if (!this.node)
      return;
    this.parentNode.removeChild(this.node);
    this.node = null;
  },

  /**
   * @function setParent
   * @see #setParent()
   */
  setParent: setParent
});
/** @endclass */

exports.Menu = Menu;
exports.SubMenu = SubMenu;
exports.Separator = Separator;
