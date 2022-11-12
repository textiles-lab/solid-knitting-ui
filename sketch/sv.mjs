export class Body {
	constructor() {
		this.cells = [];
	}
	relax() { } //update positions based on connections between blocks + construction plane position
	check() { } //consistency check (connections point both directions)
	static fromArrayBuffer(buffer, library) {
		const text = new TextDecoder("utf-8").decode(buffer);
		const json = stripComments(text);
		const data = JSON.parse(json);
		return Body.fromData(data, library);
	}
	static fromData(data, library) {
		if (!Array.isArray(data)) throw new Error("");
		let body = new Body();

		for (const cell of data) {
			if (typeof cell.template !== 'string') throw new Error("Cell template should be a string.");
			if (!(cell.template in library.templates)) throw new Error(`Cell template "${cell.template}" does not appear in the library.`);
			let template = library.templates[cell.template];

			if (!Array.isArray(cell.vertices)) throw new Error("Cell vertices should be an array.");
			if (cell.vertices.length !== template.vertices.length) throw new Error("Cell should have same number of vertices as its template.");
			let vertices = [];
			for (const vertex of cell.vertices) {
				vertices.push(toVec3(`cell vertex "${JSON.stringify(vertex)}"`, vertex));
			}

			if (!Array.isArray(cell.connections)) throw new Error("Cell connections should be an array.");
			if (cell.connections.length !== template.faces.length) throw new Error("Cell should have same number of connections as its template's faces.");
			let connections = [];
			for (const connection of cell.connections) {
				if (typeof connection !== 'object') throw new Error("Cell connections should be an object.");
				if (connection === null) {
					//not connected
					connections.push(null);
				} else {
					//connected to something
					if (typeof connection.cell !== 'number' || connection.cell >= data.length) throw new Error(`Connection.cell should be an index into cells list.`);
					if (typeof connection.face !== 'number') throw new Error("connection face should be a number.");
					connections.push({cell:connection.cell, face:connection.face});
				}
			}

			body.cells.push(new Cell({template, vertices, connections}));
		}

		//convert connections from indices -> references:
		for (const cell of body.cells) {
			for (const connection of cell.connections) {
				if (connection === null) continue;
				connection.cell = body.cells[connection.cell];
				if (connection.face >= connection.cell.template.faces.length) throw new Error("connected face doesn't exist in neighbor.");
			}
		}

		//check reflexivity:
		for (const cell of body.cells) {
			for (let i = 0; i < cell.connections.length; ++i) {
				const connection = cell.connections[i];
				if (connection === null) continue;
				if (connection.cell.connections[connection.face].cell !== cell
				 || connection.cell.connections[connection.face].face !== i) {
					throw new Error("Non-reflexive connection.");
				}
			}
		}

		return body;
	}
}

export class Cell {
	constructor({
		template,
		vertices,
		connections
	}) {
		if (!(template instanceof Template)) throw new Error("Cell's template must be a Template");
		if (!(template.vertices.length === vertices.length)) throw new Error("Should have as many vertices as template.");
		if (!(template.faces.length === connections.length)) throw new Error("Should have as many connections as template.faces .");

		this.template = template;
		this.vertices = vertices;
		this.connections = connections; //connections have "block" (reference) and "face" (index)

		//should be the case that:
		//this.connections[0].block.connections[ this.connections[0].face ] === this

	}
};

export class Library {
	constructor() {
		this.templates = {};
	}
	//convert from/to data suitable from JSON.stringify()/.parse():
	static fromData(data) {
		if (!Array.isArray(data)) throw new Error("Library data should be array of prototype blocks.");
		const lib = new Library();
		for (let item of data) {
			const template = new Template(item);
			const key = template.signature();
			if (key in lib.templates) {
				throw new Error(`Two templates in library with signature "${key}".`);
			}
			lib.templates[key] = template;
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

export class Template {
	constructor({
		name = "",
		vertices = [],
		faces = [],
		yarns = [],
		machine = {},
		human = {}
	} = {}) {
		this.name = name;

		//vertices should be 3D, lexicographic [by x,y,z] order:
		if (!Array.isArray(vertices)) throw new Error("LibraryBlock.vertices should be an array.");
		this.vertices = [];
		function isFloat3(x) {
			if (!Array.isArray(x)) return false;
			if (x.length !== 3) return false;
			if (!x.every( (v) => typeof v === 'number' )) return false;
			return true;
		}
		for (let i = 0; i < vertices.length; ++i) {
			this.vertices.push(toVec3(`Template.vertices[${i}]`, vertices[i]));
		}
		for (let i = 1; i < this.vertices.length; ++i) {
			const a = this.vertices[i-1];
			const b = this.vertices[i];
			if (a.x < b.x
			 || (a.x === b.x && a.y < b.y)
			 || (a.x === b.x && a.y === b.y && a.z < b.z)) {
				//great, a < b
			} else {
				throw new Error(`Vertices ${a} and ${b} are not ordered by x,y,z.`);
			}
		}

		//faces should be objects with a 'type', 'indices', and 'color':
		if (!Array.isArray(faces)) throw new Error("LibraryBlock.faces should be an array.");
		function isVertexArray(x) {
			if (!Array.isArray(x)) return false;
			if (x.length < 3) return false; //faces should have at least 3 vertices
			if (!x.every( (v) => (
				typeof v === 'number' && Math.round(v) === v //should be integers
				&& v >= 0 && v < vertices.length //should index a valid vertex
			))) return false;
			return true;
		}
		for (let i = 0; i < faces.length; ++i) {
			if (typeof faces[i].type !== 'string') throw new Error(`Template.faces[${i}].type should be a string.`);
			if (!isVertexArray(faces[i].indices)) throw new Error(`Template.faces[${i}].indices (${faces[i].indices}) should be an array of vertex indices.`);
			if (typeof faces[i].color !== 'string') throw new Error(`Template.faces[${i}].color should be a string.`);
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

function toVec3(what, val) {
	if (!Array.isArray(val)
	 || val.length !== 3
	 || !val.every( (v) => typeof v === 'number' ) ) throw new Error(`${what} is not an array of 3 numbers.`);
	return {x:val[0], y:val[1], z:val[2]};
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
