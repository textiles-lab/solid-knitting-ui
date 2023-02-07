'use strict'; //likely to be redundant since this is a module

// "solid knitout" tools

// inspired by ace highlighting https://github.com/ajaxorg/ace/blob/master/src/mode/text_highlight_rules.js
function tokenize(line) {

	const rules = [ {
			token : "comment",
			regex : /^;.*$/
		}, {
			token : "location",
			regex : /^((h(f|b)[0-9]*,[0-9]*)|((f|b)[0-9]*))/
		}, {
			token : "string",
			regex : /^"[^"]*"/
		}, {
			token : "keyword",
			regex : /^(tuck)|(knit)|(xfer)|(release)|(pause)|(drop)/
		},  {
			token : "direction",
			regex : /^(\+|-)/
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
			// console.log(rule.token, match);
			if (match !== null) {
				// console.log(match[0]);
				tokens.push({token: rule.token, text: match[0]});
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

export function writeHighlightedCode(code, target, consolidate=true) {
	target.textContent = ''; // clear anything currently in target

	const orderedCode = consolidate ? groupPasses(code) : code;

	const lines = orderedCode.split("\n");
	for (let line of lines) {
		const tokens = tokenize(line);

		const item = document.createElement('div');
		// item.innerHTML = line;
		item.classList.add("line");
		if (tokens.length === 0) {
			const span = document.createElement('span');
			span.classList.add("whitespace");
			span.innerHTML = " "; // add space to keep line height

			item.appendChild(span);
		}
		for (let token of tokens) {
			const span = document.createElement('span');
			span.innerHTML = token.text;
			span.classList.add(token.token);

			// const tooltip = document.createElement('div');
			// tooltip.innerHTML = token.token;
			// tooltip.classList.add("tooltiptext");
			// span.appendChild(tooltip);

			item.appendChild(span);
		}
		target.appendChild(item);
	}
}

export function groupBlocks(code) {
	console.log("groupBlocks not implemented yet");
	return code;
}

// takes in a string of solid knitout code.
// finds all sequences of tuck, xfer, and knit commands within the code which operate
// on the same holder rows of the two beds and orders them to to tuck first,
// then xfer from needle to holder, then xfer from holder to needle and finally knit
export function groupPasses(code) {
	// regular expression to find the row of the holding needle in a string
	// https://javascript.info/regexp-groups
	const matchHolder = /h(f|b)[0-9]*,([0-9])*/;
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

			let tucks = [];
			let xfersToHolder = [];
			let xfersFromHolder = [];
			let knits = [];

			const classifyLine = function(line) {
				if (/^\s*tuck/.test(line)) {
					// if line starts with whitespace followed by "tuck", it's a tuck
					tucks.push(line);
				} else if (/^\s*knit/.test(line)) {
					// if line starts with whitespace followed by "knit", it's a knit
					knits.push(line);
				} else if (/^\s*xfer\s+h/.test(line)) {
					// if line starts with whitespace followed by xfer h, it's an xfer from a holder
					// TODO: do we care about xfers between holders?
					xfersFromHolder.push(line);
				} else if (/h(f|b)[0-9]*,[0-9]\s*($|;)/.test(line)) {
					// if the line ends with a holder location followed by whitespace, it's an xfer to a holder
					xfersToHolder.push(line);
				} else {
					console.err("failed to classify line ", line);
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

				const currMatch = currLine.match(matchHolder);
				if (currMatch === null || currMatch.length < 3) {
					break; // found line not involving holder. Stop pass
				}
				if ((currMatch[1] === startHolderBed && currMatch[2] === startHolderRow)
					|| (currMatch[1] === oppHolderBed && currMatch[2] === oppHolderRow)) {
					// if we're using the same row on the same bed, we can incorporate this line into the pass
					classifyLine(currLine);
					++iL;
				} else if (oppHolderBed === null && currMatch[1] !== startHolderBed) {
					// if we've found the first reference to a holder on the opposite bed, take that as the row to use in the pass
					oppHolderBed = currMatch[1];
					oppHolderRow = currMatch[2];
					classifyLine(currLine);
					++iL;
				} else {
					break; // must have switched to a new holder
				}
			}

			resultLines = resultLines.concat(tucks);
			if (tucks.length > 0) resultLines.push("");
			resultLines = resultLines.concat(xfersToHolder);
			if (xfersToHolder.length > 0) resultLines.push("");
			resultLines = resultLines.concat(xfersFromHolder);
			if (xfersFromHolder.length > 0) resultLines.push("");
			resultLines = resultLines.concat(knits);
			if (knits.length > 0) resultLines.push("");
		}
	}
	return resultLines.join("\n");
}
