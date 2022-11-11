'use strict';
(function(){

const sv = (typeof(module) === 'undefined' ? (window.sv = {}) : module.exports);

class Blocks {
	constructor() {
		this.blocks = [];
	}
	static fromArrayBuffer(buffer) {
		const text = new TextDecoder("utf-8").decode(buffer);

		console.log(text); //DEBUG

		return new Blocks(); //TODO
	}
}
sv.Blocks = Blocks;

class Block {
	constructor({
		type,
		vertices,
		connections
	}) {
		if (!(type instanceof LibraryBlock)) throw new Error("Block's type must be a LibraryBlock");
		if (!(type.vertices.length === vertices.length)) throw new Error("Should have same length vertices as type.");
		if (!(type.faces.length === connections.length)) throw new Error("Should have same connections as type.faces .");

		this.type = type;
		this.vertices = vertices;
		this.connections = connections;

	}
};

class Library {
	constructor() {
		this.types = {};
	}
	//convert from/to data suitable from JSON.stringify()/.parse():
	static fromData(data) {
		if (!Array.isArray(data)) throw new Error("Library data should be array of prototype blocks.");
		const lib = new Library();
		for (let item of data) {
			const type = new LibraryBlock(item);
			const key = type.signature();
			if (key in lib.types) {
				throw new Error(`Two blocks in library with signature "${key}".`);
			}
			lib.types[key] = type;
		}
		return lib;
	}
	toData() {
	}
	static fromArrayBuffer(buffer) {
		const text = new TextDecoder("utf-8").decode(buffer);
		const json = stripComments(text);
		const data = JSON.parse(json);
		return Library.fromData(data);
	}
}
sv.Library = Library;

class LibraryBlock {
	constructor({
		name = "",
		vertices = [],
		faces = [],
		yarns = [],
		machine = {},
		human = {}
	} = {}) {
		this.name = name;

		//vertices should be 3D, lexicographic [by z,y,x] order:
		if (!Array.isArray(vertices)) throw new Error("LibraryBlock.vertices should be an array.");
		function isFloat3(x) {
			if (!Array.isArray(x)) return false;
			if (x.length !== 3) return false;
			if (!x.every( (v) => typeof v === 'number' )) return false;
			return true;
		}
		for (let i = 0; i < vertices.length; ++i) {
			if (!isFloat3(vertices[i])) throw new Error(`LibraryBlock.vertices[${i}] should be an array of 3 numbers.`)
		}
		for (let i = 1; i < vertices.length; ++i) {
			const a = vertices[i-1];
			const b = vertices[i];
			if (a[2] < b[2]
			 || (a[2] === b[2] && a[1] < b[1])
			 || (a[2] === b[2] && a[1] === b[1] && a[0] < b[0])) {
				//great, a < b
			} else {
				throw new Error(`Vertices ${a} and ${b} are not ordered by z,y,x.`);
			}
		}
		this.vertices = vertices;

		//faces should be objects with a 'type', 'indices', and 'color':
		if (!Array.isArray(faces)) throw new Error("LibraryBlock.faces should be an array.");
		function isVertexArray(x) {
			if (!Array.isArray(x)) return false;
			if (x.length < 3) return false; //faces should have at least 3 vertices
			if (!x.every( (v) => (
				typeof v === 'number' && Math.round(v) === v //should be integers
				&& v >= x[0] //should start with lowest number
				&& v >= 0 && v < vertices.length //should index a valid vertex
			))) return false;
			return true;
		}
		for (let i = 0; i < faces.length; ++i) {
			if (typeof faces[i].type !== 'string') throw new Error(`LibraryBlock.faces[${i}].type should be a string.`);
			if (!isVertexArray(faces[i].indices)) throw new Error(`LibraryBlock.faces[${i}].indices shoudl be an array of vertex indices.`);
			if (typeof faces[i].color !== 'string') throw new Error(`LibraryBlock.faces[${i}].color should be a string.`);
		}
		for (let i = 1; i < faces.length; ++i) {
			const a = faces[i-1];
			const b = faces[i];
			const length = Math.max(a.length, b.length);
			let compare;
			for (let x = 0; x < length; ++x) {
				if (x < a.length && x < b.length) {
					if (a[x] !== b[x]) {
						compare = (a[x] < b[x] ? -1 : 1);
						break;
					}
				} else if (x >= a.length) {
					compare = -1;
					break;
				} else { //x >= b.length
					compare = 1;
					break;
				}
			}
			if (compare >= 0) throw new Error(`LibraryBlock.faces[${i}] does not have indices larger than previous face.`);
		}
		this.faces = faces;

		//yarns: format somewhat TBD at the moment
		this.yarns = yarns;
		//instructions:
		this.machine = machine;
		this.human = human;
	}

	//return a unique name made from the name and face.type fields:
	signature() {
		let sig = this.name;
		for (let face of this.faces) {
			sig += ' ' + face.type;
		}
		return sig;
	}
}

function stripComments(text) {
	//strip '//'-style comments from otherwise-json-style text.
	let ret = '';
	let inString = false;
	for (let i = 0; i < text.length; ++i) {
		if (inString) {
			ret += text[i];
			if (text[i] === '\\') {
				ret += text[i+1]; //copy next character as well
				++i; //and then skip processing it
			} else if (text[i] === '"') {
				inString = false;
			}
		} else {
			if (text[i] === '/' && text[i+1] === '/') {
				while (i < text.length && text[i] !== '\n') i += 1;
				if (i < text.length) i -= 1;
			} else {
				ret += text[i];
				if (text[i] === '"') {
					inString = true;
				}
			}
		}
	}
	return ret;
}

})();
