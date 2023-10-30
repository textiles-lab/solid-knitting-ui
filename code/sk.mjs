'use strict'; //likely to be redundant since this is a module

// "solid knitout" tools

// inspired by ace highlighting https://github.com/ajaxorg/ace/blob/master/src/mode/text_highlight_rules.js
function tokenize(line) {

	const rules = [ {
			token : "comment",
			regex : /^\s*;.*$/
		}, {
			token : "pause",
			regex : /^\s*pause(\s+)(.*)\s*$/ // parentheses capture the whitespace and the string part of the command
		}, {
			token : "location",
			regex : /^\s*((h(f|b)[0-9\*]*,[0-9]*)|((f|b)[0-9]*))/
		}, {
			token : "string",
			regex : /^\s*"[^"]*"/
		}, {
			token : "keyword",
			regex : /^\s*(tuck)|(knit)|(xfer)|(release)|(drop)|(roll)/
		}, {
			token : "direction",
			regex : /^\s*(\+|-)/
		}, {
			token : "whitespace",
			regex : /^\s+/
		}, { // for now, assume that anything else is a carrier. TODO: match carriers from carrier list at the top of the file
			token : "carrier",
			regex : /^\w/
		}
	];

	let tokens = [];
	const origLine = line;
	while (line.length > 0) {
		let matched = false;
		for (let rule of rules) {
			const match = rule.regex.exec(line);
			if (match !== null) {
				if (rule.token === "pause") { // handle pause specially to format string
					tokens.push({token: "keyword", text: "pause"});
					tokens.push({token: "whitespace", text: match[1]});
					tokens.push({token: "string", text: match[2]});
				} else {
					tokens.push({token: rule.token, text: match[0]});
				}
				line = line.substring(match[0].length);
				matched = true;
				break;
			}
		}
		if (!matched) {
			tokens.push({token: "unmatched_text", text:line});
			console.log("failed to match ", line, " from ", origLine);
			break;
		}
	}
	return tokens;
}

export function writeHighlightedCode(fragmentList, target, consolidate=true) {
	target.textContent = ''; // clear anything currently in target

	const orderedCode = consolidate ? groupPasses(fragmentList) : noPassGrouping(fragmentList);

	const lines = orderedCode.split("\n");
	for (let iL=0; iL<lines.length; ++iL) {
		let tokens = tokenize(lines[iL]);
		if (tokens.length === 0) tokens = [{text: " ", token: "whitespace"}]; // add space to keep line height s

		const item = document.createElement('div');
		item.classList.add("line");

		// line number
		const lineNo = document.createElement('span');
		lineNo.innerHTML = iL;
		lineNo.classList.add("line-number");
		item.appendChild(lineNo);

		// code
		const code = document.createElement('div');
		code.classList.add("code");
		for (let token of tokens) {
			const span = document.createElement('span');
			span.innerHTML = token.text;
			span.classList.add(token.token);

			// const tooltip = document.createElement('div');
			// tooltip.innerHTML = token.token;
			// tooltip.classList.add("tooltiptext");
			// span.appendChild(tooltip);

			code.appendChild(span);
		}
		item.appendChild(code);
		target.appendChild(item);
	}
}

export function groupBlocks(code) {
	console.log("groupBlocks not implemented yet");
	return code;
}

// Take all instructions in a list of program fragments and emit them in order
export function noPassGrouping(fragmentList) {
	if (!fragmentList) return "error: no fragment list";
	let solidk = "";
	for (const fragment of fragmentList) {
		for (const instruction of fragment["instructions"]) {
			solidk += instruction + "\n";
		}
	}
	return solidk;
}

// Take a list of program fragments and group them into passes before emitting the resulting code
// Consecutive fragments with the same id have their instructions interleaved into unified passes
// Fragments are in the form { "id": "fragName", "instructions": ["list", "of", "instructions"] }
// Also does the following:
//    omits any releases that happen at the beginning of the program (artifacts from cast on row)
//    omits empty fragments
//    merges fragments from drops followed immediately by knits
export function groupPasses(fragmentList) {
	// console.log(fragmentList)

	let solidk = "";
	let iF = 0;
	let atProgramStart = true;
	while (iF < fragmentList.length) {
		let currID = fragmentList[iF]["id"];

		// only perform releases associated with yarn-next-row after program has started making stitches
		if (atProgramStart && currID.startsWith("yarn-next-row")) {
			iF++;
			continue;
		}

		let passFragments = [];
		let nextKnitID = null;
		let subsequentKnitFragments = [];
		let lookahead = 0;
		// accumulate all following fragments with the same id, along with some special logic for drops
		while (iF + lookahead < fragmentList.length) {
			const fragment = fragmentList[iF + lookahead];
			if (fragment["id"] === currID) { // contained in same run of instructions
				passFragments.push(fragment["instructions"]);
			} else if (fragment["instructions"].length == 0) { // accept empty fragments, but don't do anything with them
			} else if (currID.startsWith("drop")) { // special case to merge drops with subsequent knits
				// end pass if instruction is not a knit
				if (!fragment["id"].startsWith("knit")) break;

				// if we haven't found any knits yet, grab the next knit id
				if (nextKnitID === null) nextKnitID = fragment["id"];

				// only accept knits with the same id into this pass
				if (fragment["id"] === nextKnitID) {
					subsequentKnitFragments.push(fragment["instructions"]);
				} else {
					break;
				}

			} else {
				break; // end pass
			}
			lookahead++;
		}

		console.log(currID, atProgramStart, passFragments);

		// interleave fragments
		if (subsequentKnitFragments.length > 0) {
			// special case for interleaved drops + knits
			if (subsequentKnitFragments[0].length == 4) {
				for (let iI = 0; iI < 2; ++iI) {
					for (let iF = 0; iF < subsequentKnitFragments.length; ++iF) {
						solidk += subsequentKnitFragments[iF][iI] + "\n";
					}
					solidk += "\n";
				}
				for (let iI = 0; iI < passFragments[0].length; ++iI) {
					for (let iF = 0; iF < passFragments.length; ++iF) {
						// dedupe pause messages
						if (iF > 0 && passFragments[iF][iI].startsWith("pause") && passFragments[iF][iI] === passFragments[0][iI]) continue;

						solidk += passFragments[iF][iI] + "\n";
					}
					solidk += "\n";
				}
				for (let iI = 2; iI < 4; ++iI) {
					for (let iF = 0; iF < subsequentKnitFragments.length; ++iF) {
						solidk += subsequentKnitFragments[iF][iI] + "\n";
					}
					solidk += "\n";
				}

			} else { // if knits don't have four instructions, just leave in current order for now
				console.error("Subsequent knit fabric does not have 4 instructions, so drop interleaving is undefined. Passes will be left in the given order");
				for (let iI = 0; iI < passFragments[0].length; ++iI) {
					for (let iF = 0; iF < passFragments.length; ++iF) {
						solidk += passFragments[iF][iI] + "\n";
					}
					solidk += "\n";
				}
				for (let iI = 0; iI < subsequentKnitFragments[0].length; ++iI) {
					for (let iF = 0; iF < subsequentKnitFragments.length; ++iF) {
						solidk += subsequentKnitFragments[iF][iI] + "\n";
					}
					solidk += "\n";
				}
			}
		} else {	
			for (let iI = 0; iI < passFragments[0].length; ++iI) {
				for (let iF = 0; iF < passFragments.length; ++iF) {
					// dedupe pause messages
					if (iF > 0 && passFragments[iF][iI].startsWith("pause") && passFragments[iF][iI] === passFragments[0][iI]) continue;

					solidk += passFragments[iF][iI] + "\n";
				}
				solidk += "\n";
			}
		}
		iF += lookahead;
		if ( ! (currID.startsWith("pause")
			    || currID.startsWith("comment")
			    || currID.startsWith("yarn-in")
			    || currID.startsWith("cast-on")
			 ) ) atProgramStart = false;
	}
	return solidk;
}

// DEPRECATED - this code operates directly on solid knitout text. The above version which operates on "code fragments" should be used instead
// takes in a string of solid knitout code.
// finds all sequences of tuck, xfer, knit, and drop commands within the code which operate
// on the same holder rows of the two beds and orders them to first show comments, then tuck,
// then xfer from needle to holder, then xfer from holder to needle and finally knit and drop
export function groupTextPasses(code) {
	// regular expression to find the row of the holding needle in a string
	// https://javascript.info/regexp-groups
	const matchHolder = /h(f|b)[0-9]*,([0-9])*/;
	const matchNeedle = /\s(f|b)[0-9]*/;
	const inputLines = code.split("\n");
	let resultLines = [];

	let iL = 0;
	while(iL < inputLines.length) {
		const line = inputLines[iL++];
		// TODO: extract block names from comments if present?
		if (line.length === 0 || line[0] === ";") {
			resultLines.push(line);
			continue;
		}

		const match = line.match(matchHolder);
		if (match === null || match.length < 3) {
			resultLines.push(line);
		} else {
			const startHolderBed = match[1]; // which holders on the current bed are used in this pass?
			const startHolderRow = match[2];
			let oppHolderBed = null; // which holders on the opposite bed are used in this pass?
			let oppHolderRow = null;

			let comments = [];
			let tucks = [];
			let xfersToHolder = [];
			let xfersFromHolder = [];
			let knits = [];
			let drops = [];

			const classifyLine = function(line) {
				if (/^\s*;/.test(line)) {
					comments.push(line);
				} else if (/^\s*tuck/.test(line)) {
					// if line starts with whitespace followed by "tuck", it's a tuck
					tucks.push(line);
				} else if (/^\s*knit/.test(line)) {
					// if line starts with whitespace followed by "knit", it's a knit
					knits.push(line);
				} else if (/^\s*xfer\s+h/.test(line)) {
					// if line starts with whitespace followed by xfer h, it's an xfer from a holder
					// TODO: do we care about xfers between holders?
					xfersFromHolder.push(line);
				} else if (/h(f|b)[0-9]*,[0-9]\s*;?.*?$/.test(line)) {
					// if the line ends with a holder location followed by whitespace, it's an xfer to a holder
					xfersToHolder.push(line);
				} else if (/^\s*drop/.test(line)) {
					drops.push(line);
				} else {
					console.error("failed to classify line ", line);
				}
			};
			classifyLine(line);
			while (iL < inputLines.length) {
				const currLine = inputLines[iL];
				if (/^\s*$/.test(currLine)) {
					// if line is entirely whitespace, just ignore it
					++iL;
					continue;
				}

				// TODO: check compatibility of drop needles w/ needles in other instructions
				if (/^\s*drop/.test(currLine) || /^\s*;/.test(currLine)) {
					classifyLine(currLine);
					++iL;
					continue;
				}

				const currHolder = currLine.match(matchHolder);

				
				if (currHolder === null || currHolder.length < 3) {
					break; // found line not involving holder. Stop pass
				}
				if ((currHolder[1] === startHolderBed && currHolder[2] === startHolderRow)
					|| (currHolder[1] === oppHolderBed && currHolder[2] === oppHolderRow)) {
					// if we're using the same row on the same bed, we can incorporate this line into the pass
					classifyLine(currLine);
					++iL;
				} else if (oppHolderBed === null && currHolder[1] !== startHolderBed) {
					// if we've found the first reference to a holder on the opposite bed, take that as the row to use in the pass
					oppHolderBed = currHolder[1];
					oppHolderRow = currHolder[2];
					classifyLine(currLine);
					++iL;
				} else {
					break; // must have switched to a new holder
				}
			}

			resultLines = resultLines.concat(comments);
			if (comments.length > 0) resultLines.push("");
			resultLines = resultLines.concat(tucks);
			if (tucks.length > 0) resultLines.push("");
			resultLines = resultLines.concat(xfersToHolder);
			if (xfersToHolder.length > 0) resultLines.push("");
			resultLines = resultLines.concat(xfersFromHolder);
			if (xfersFromHolder.length > 0) resultLines.push("");
			resultLines = resultLines.concat(knits);
			if (knits.length > 0) resultLines.push("");
			resultLines = resultLines.concat(drops);
			if (drops.length > 0) resultLines.push("");
		}
	}
	return resultLines.join("\n");
}
