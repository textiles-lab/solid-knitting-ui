'use strict'; //likely to be redundant since this is a module

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
			token : "carrier",
			regex : /^(\w+)$/
		}, {
			token : "text",
			regex : /^\s+/
		}
	];

	let tokens = [];
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
			break;
		}
	}
	return tokens;
}

export function writeHighlightedCode(code, target) {
	target.textContent = ''; // clear anything currently in target

	const lines = code.split("\n");
	for (let line of lines) {
		const tokens = tokenize(line);

		const item = document.createElement('div');
		// item.innerHTML = line;
		item.classList.add("line");
		for (let token of tokens) {
			const span = document.createElement('span');
			span.innerHTML = token.text;
			span.classList.add(token.token);
			item.appendChild(span);
		}
		target.appendChild(item);
	}
}


