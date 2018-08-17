// Author: Mikhail Kashkin (https://t.me/mkashkin)

(function (mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        mod(require("../../lib/codemirror"));
    else if (typeof define == "function" && define.amd) // AMD
        define(["../../lib/codemirror"], mod);
    else // Plain browser env
        mod(CodeMirror);
})(function (CodeMirror) {
    "use strict";

    CodeMirror.defineMode("markdown-tg", function (cmCfg, modeCfg) {

        var htmlModeMissing = htmlMode.name == "null"

        function getMode(name) {
            if (CodeMirror.findModeByName) {
                var found = CodeMirror.findModeByName(name);
                if (found) name = found.mime || found.mimes[0];
            }
            var mode = CodeMirror.getMode(cmCfg, name);
            return mode.name == "null" ? null : mode;
        }

        var tokenTypes = {
            code: "comment",
            quote: "quote",
            linkInline: "link",
            linkEmail: "link",
            linkText: "link",
            linkHref: "string",
            em: "em",
            strong: "strong",
            emoji: "builtin"
        };

        var textRE = /^[^#!\[\]*_\\<>` "'(~:]+/
            , fencedCodeRE = /^(```+)[ \t]*([\w+#-]*)[^\n`]*$/
            , linkDefRE = /^\s*\[[^\]]+?\]:.*$/ // naive link-definition
            , punctuation = /[!\"#$%&\'()*+,\-\.\/:;<=>?@\[\\\]^_`{|}~—]/

        function switchInline(stream, state, f) {
            state.f = state.inline = f;
            return f(stream, state);
        }

        function switchBlock(stream, state, f) {
            state.f = state.block = f;
            return f(stream, state);
        }

        function lineIsEmpty(line) {
            return !line || !/\S/.test(line.string)
        }

        // Blocks

        function blankLine(state) {
            // Reset linkTitle state
            state.linkHref = false;
            state.linkText = false;
            // Reset EM state
            state.em = false;
            // Reset STRONG state
            state.strong = false;
            // Reset strikethrough state
            state.quote = 0;
            // Reset state.indentedCode
            // Reset state.trailingSpace
            state.trailingSpace = 0;
            state.trailingSpaceNewLine = false;
            // Mark this line as blank
            state.prevLine = state.thisLine
            state.thisLine = { stream: null }
            return null;
        }

        function blockNormal(stream, state) {
            var firstTokenOnLine = stream.column() === state.indentation;
            var prevLineLineIsEmpty = lineIsEmpty(state.prevLine.stream);
            var prevLineIsList = state.list !== false;

            state.indentedCode = false;

            var lineIndentation = state.indentation;
            // compute once per line (on first token)
            if (state.indentationDiff === null) {
                state.indentationDiff = state.indentation;
                if (prevLineIsList) {
                    // Reset inline styles which shouldn't propagate aross list items
                    state.em = false;
                    state.strong = false;
                    state.code = false;
                }
            }

            var match = null;
            if (state.indentationDiff >= 4 && (prevLineIsIndentedCode || state.prevLine.fencedCodeEnd ||
                state.prevLine.header || prevLineLineIsEmpty)) {
                stream.skipToEnd();
                state.indentedCode = true;
                return tokenTypes.code;
            } else if (stream.eatSpace()) {
                return null;
            }

            return switchInline(stream, state, state.inline);
        }

        function local(stream, state) {
            var hasExitedList = state.indentation < currListInd;
            var maxFencedEndInd = currListInd + 3;
            if (state.fencedEndRE && state.indentation <= maxFencedEndInd && (hasExitedList || stream.match(state.fencedEndRE))) {
                if (modeCfg.highlightFormatting) state.formatting = "code-block";
                var returnType;
                if (!hasExitedList) returnType = getType(state)
                state.localMode = state.localState = null;
                state.block = blockNormal;
                state.f = inlineNormal;
                state.fencedEndRE = null;
                state.code = 0
                state.thisLine.fencedCodeEnd = true;
                if (hasExitedList) return switchBlock(stream, state, state.block);
                return returnType;
            } else if (state.localMode) {
                return state.localMode.token(stream, state.localState);
            } else {
                stream.skipToEnd();
                return tokenTypes.code;
            }
        }

        // Inline
        function getType(state) {
            var styles = [];

            if (state.formatting) {
                styles.push(tokenTypes.formatting);

                if (typeof state.formatting === "string") state.formatting = [state.formatting];

                for (var i = 0; i < state.formatting.length; i++) {
                    styles.push(tokenTypes.formatting + "-" + state.formatting[i]);

                    if (state.formatting[i] === "header") {
                        styles.push(tokenTypes.formatting + "-" + state.formatting[i] + "-" + state.header);
                    }

                    // Add `formatting-quote` and `formatting-quote-#` for blockquotes
                    // Add `error` instead if the maximum blockquote nesting depth is passed
                    if (state.formatting[i] === "quote") {
                        if (!modeCfg.maxBlockquoteDepth || modeCfg.maxBlockquoteDepth >= state.quote) {
                            styles.push(tokenTypes.formatting + "-" + state.formatting[i] + "-" + state.quote);
                        } else {
                            styles.push("error");
                        }
                    }
                }
            }

            if (state.taskOpen) {
                styles.push("meta");
                return styles.length ? styles.join(' ') : null;
            }
            if (state.taskClosed) {
                styles.push("property");
                return styles.length ? styles.join(' ') : null;
            }

            if (state.linkHref) {
                styles.push(tokenTypes.linkHref, "url");
            } else { // Only apply inline styles to non-url text
                if (state.strong) { styles.push(tokenTypes.strong); }
                if (state.em) { styles.push(tokenTypes.em); }
                if (state.strikethrough) { styles.push(tokenTypes.strikethrough); }
                if (state.emoji) { styles.push(tokenTypes.emoji); }
                if (state.linkText) { styles.push(tokenTypes.linkText); }
                if (state.code) { styles.push(tokenTypes.code); }
                if (state.image) { styles.push(tokenTypes.image); }
                if (state.imageAltText) { styles.push(tokenTypes.imageAltText, "link"); }
                if (state.imageMarker) { styles.push(tokenTypes.imageMarker); }
            }

            if (state.header) { styles.push(tokenTypes.header, tokenTypes.header + "-" + state.header); }

            if (state.quote) {
                styles.push(tokenTypes.quote);

                // Add `quote-#` where the maximum for `#` is modeCfg.maxBlockquoteDepth
                if (!modeCfg.maxBlockquoteDepth || modeCfg.maxBlockquoteDepth >= state.quote) {
                    styles.push(tokenTypes.quote + "-" + state.quote);
                } else {
                    styles.push(tokenTypes.quote + "-" + modeCfg.maxBlockquoteDepth);
                }
            }

            if (state.trailingSpaceNewLine) {
                styles.push("trailing-space-new-line");
            } else if (state.trailingSpace) {
                styles.push("trailing-space-" + (state.trailingSpace % 2 ? "a" : "b"));
            }

            return styles.length ? styles.join(' ') : null;
        }

        function handleText(stream, state) {
            if (stream.match(textRE, true)) {
                return getType(state);
            }
            return undefined;
        }

        function inlineNormal(stream, state) {
            var style = state.text(stream, state);
            if (typeof style !== 'undefined')
                return style;

            var ch = stream.next();

            if (ch === ']' && state.linkText) {
                if (modeCfg.highlightFormatting) state.formatting = "link";
                var type = getType(state);
                state.linkText = false;
                state.inline = state.f = stream.match(/\(.*?\)| ?\[.*?\]/, false) ? linkHref : inlineNormal
                return type;
            }

            if (ch === '<' && stream.match(/^(https?|ftps?):\/\/(?:[^\\>]|\\.)+>/, false)) {
                state.f = state.inline = linkInline;
                if (modeCfg.highlightFormatting) state.formatting = "link";
                var type = getType(state);
                if (type) {
                    type += " ";
                } else {
                    type = "";
                }
                return type + tokenTypes.linkInline;
            }

            if (ch === '<' && stream.match(/^[^> \\]+@(?:[^\\>]|\\.)+>/, false)) {
                state.f = state.inline = linkInline;
                if (modeCfg.highlightFormatting) state.formatting = "link";
                var type = getType(state);
                if (type) {
                    type += " ";
                } else {
                    type = "";
                }
                return type + tokenTypes.linkEmail;
            }

            if (ch === ' ') {
                if (stream.match(/ +$/, false)) {
                    state.trailingSpace++;
                } else if (state.trailingSpace) {
                    state.trailingSpaceNewLine = true;
                }
            }

            return getType(state);
        }

        function linkInline(stream, state) {
            var ch = stream.next();

            if (ch === ">") {
                state.f = state.inline = inlineNormal;
                if (modeCfg.highlightFormatting) state.formatting = "link";
                var type = getType(state);
                if (type) {
                    type += " ";
                } else {
                    type = "";
                }
                return type + tokenTypes.linkInline;
            }

            stream.match(/^[^>]+/, true);

            return tokenTypes.linkInline;
        }

        function linkHref(stream, state) {
            // Check if space, and return NULL if so (to avoid marking the space)
            if (stream.eatSpace()) {
                return null;
            }
            var ch = stream.next();
            if (ch === '(' || ch === '[') {
                state.f = state.inline = getLinkHrefInside(ch === "(" ? ")" : "]");
                if (modeCfg.highlightFormatting) state.formatting = "link-string";
                state.linkHref = true;
                return getType(state);
            }
            return 'error';
        }

        var linkRE = {
            ")": /^(?:[^\\\(\)]|\\.|\((?:[^\\\(\)]|\\.)*\))*?(?=\))/,
            "]": /^(?:[^\\\[\]]|\\.|\[(?:[^\\\[\]]|\\.)*\])*?(?=\])/
        }

        function getLinkHrefInside(endChar) {
            return function (stream, state) {
                var ch = stream.next();

                if (ch === endChar) {
                    state.f = state.inline = inlineNormal;
                    if (modeCfg.highlightFormatting) state.formatting = "link-string";
                    var returnState = getType(state);
                    state.linkHref = false;
                    return returnState;
                }

                stream.match(linkRE[endChar])
                state.linkHref = true;
                return getType(state);
            };
        }

        var mode = {
            startState: function () {
                return {
                    f: blockNormal,

                    prevLine: { stream: null },
                    thisLine: { stream: null },

                    block: blockNormal,
                    htmlState: null,
                    indentation: 0,

                    inline: inlineNormal,
                    text: handleText,

                    formatting: false,
                    linkText: false,
                    linkHref: false,
                    code: 0,
                    em: false,
                    strong: false,
                    setext: 0,
                    quote: 0,
                    trailingSpace: 0,
                    trailingSpaceNewLine: false,
                    fencedEndRE: null
                };
            },

            copyState: function (s) {
                return {
                    f: s.f,

                    prevLine: s.prevLine,
                    thisLine: s.thisLine,

                    block: s.block,
                    htmlState: s.htmlState && CodeMirror.copyState(htmlMode, s.htmlState),
                    indentation: s.indentation,

                    localMode: s.localMode,
                    localState: s.localMode ? CodeMirror.copyState(s.localMode, s.localState) : null,

                    inline: s.inline,
                    text: s.text,
                    formatting: false,
                    linkText: s.linkText,
                    linkTitle: s.linkTitle,
                    linkHref: s.linkHref,
                    code: s.code,
                    em: s.em,
                    strong: s.strong,
                    setext: s.setext,
                    quote: s.quote,
                    trailingSpace: s.trailingSpace,
                    trailingSpaceNewLine: s.trailingSpaceNewLine,
                    md_inside: s.md_inside,
                    fencedEndRE: s.fencedEndRE
                };
            },

            token: function (stream, state) {

                // Reset state.formatting
                state.formatting = false;

                if (stream != state.thisLine.stream) {
                    state.header = 0;
                    state.hr = false;

                    if (stream.match(/^\s*$/, true)) {
                        blankLine(state);
                        return null;
                    }

                    state.prevLine = state.thisLine
                    state.thisLine = { stream: stream }

                    // Reset state.trailingSpace
                    state.trailingSpace = 0;
                    state.trailingSpaceNewLine = false;

                    if (!state.localState) {
                        state.f = state.block;
                    }
                }
                return state.f(stream, state);
            },

            innerMode: function (state) {
                if (state.localState) return { state: state.localState, mode: state.localMode };
                return { state: state, mode: mode };
            },

            indent: function (state, textAfter, line) {
                if (state.localState && state.localMode.indent) return state.localMode.indent(state.localState, textAfter, line)
                return CodeMirror.Pass
            },

            blankLine: blankLine,

            getType: getType,

            closeBrackets: "()[]{}''\"\"``",
            fold: "markdown"
        };
        return mode;
    }, "xml");

    CodeMirror.defineMIME("text/markdown-tg", "markdown-tg");

    CodeMirror.defineMIME("text/md-tg", "markdown-tg");

});
