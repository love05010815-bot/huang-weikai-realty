/**
 * 把 bookmarklet.js 包成 `javascript:...` 網址，塞進 install.html。
 *
 * 改了 bookmarklet.js 之後要重跑這支才會反映到 install.html：
 *   node tools/houseol/build.js
 */

"use strict";

const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const source = fs.readFileSync(path.join(DIR, "bookmarklet.js"), "utf8");
const bookmarkletUrl = "javascript:" + encodeURIComponent(source);

const template = fs.readFileSync(path.join(DIR, "install.template.html"), "utf8");
const output = template.replace("__BOOKMARKLET_URL__", bookmarkletUrl);

fs.writeFileSync(path.join(DIR, "install.html"), output, "utf8");
console.log("已產生 install.html（書籤網址長度：" + bookmarkletUrl.length + " 字元）");
