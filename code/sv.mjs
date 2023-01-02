import * as gm from './gm.mjs';

//helper to compute indices aligned by a connection between two faces:
// NOTE: indices are into face.template.indices
export function forAlignedIndices(face1, face2, func) {
	if (face1.indices.length !== face2.indices.length) throw new Error("can't find corresponding indices for faces that are different sizes.");
	if (face1.direction === face2.direction) {
		//same order:
		for (let i1 = 0; i1 < face1.indices.length; ++i1) {
			const i2 = i1;
			func(i1, i2);
		}
	} else {
		//opposite order:
		for (let i1 = 0; i1 < face1.indices.length; ++i1) {
			const i2 =  (face1.indices.length + 1 - i1) % face1.indices.length;
			func(i1, i2);
		}
	}
}

//helper for checking whether it makes sense to connect two faces:
export function canConnectFaces(face1, face2) {
	function compatibleTypes(a,b) {
		if (a[0] === '-' && b[0] === '+') return a.substr(1) === b.substr(1);
		if (a[0] === '+' && b[0] === '-') return a.substr(1) === b.substr(1);
		return false;
	}
	//should have compatible type signatures (one is '+something' and the other is '-something')
	//should also have opposite directions so cells don't overlap
	return compatibleTypes(face1.type, face2.type) && face1.direction === -face2.direction;
}

export class Body {
	constructor() {
		this.cells = [];
	}
	//update positions based on connections between blocks + construction plane position
	relax() {
		let vertices = [];
		let merged = [];
		for (const cell of this.cells) {
			cell.viBase = vertices.length;
			for (const vertex of cell.vertices) {
				merged.push(vertices.length);
				vertices.push(gm.vec4(vertex, 1));
			}
		}
		//basic union-find for making sets of vertices:
		function find(a) {
			if (merged[a] !== a) {
				merged[a] = find(merged[a]);
			}
			return merged[a];
		}
		function union(a, b) {
			const u = Math.max(find(a), find(b)); //so that representative element for set is last visited in a for loop
			merged[a] = merged[b] = u;
		}
		//make sets of vertices based on connections:
		for (const cell of this.cells) {
			for (let fi = 0; fi < cell.connections.length; ++fi) {
				const face = cell.template.faces[fi];
				const connection = cell.connections[fi];
				if (connection === null) continue;
				const cell2 = connection.cell;
				const face2 = cell2.template.faces[connection.face];
				const L = face.indices.length;
				console.assert(L === face2.indices.length);
				forAlignedIndices( face, face2, (i, i2) => {
					union(cell.viBase + face.indices[i], cell2.viBase + face2.indices[i2]);
				});
			}
		}
		//TODO: also connections to construction grid?

		//average vertex sets:
		for (let v = 0; v < vertices.length; ++v) {
			const s = find(v);
			if (s === v) {
				//last in set; divide
				console.assert(vertices[v].length === 4);
				vertices[v][0] /= vertices[v][3];
				vertices[v][1] /= vertices[v][3];
				vertices[v][2] /= vertices[v][3];
				vertices[v].pop(); //mark division as already done
			} else {
				//accumulate
				console.assert(vertices[s].length === 4);
				console.assert(vertices[v].length === 4);
				vertices[s][0] += vertices[v][0];
				vertices[s][1] += vertices[v][1];
				vertices[s][2] += vertices[v][2];
				vertices[s][3] += vertices[v][3];
			}
		}

		//fit new cell locations (+ TODO: rotations) to averaged points:
		for (const cell of this.cells) {
			//copy vertices:
			for (let vi = 0; vi < cell.vertices.length; ++vi) {
				const target = vertices[find(cell.viBase + vi)];
				cell.vertices[vi] = gm.vec3(target);
			}
			const xf = gm.rigidTransform(cell.template.vertices, cell.vertices);
			for (let vi = 0; vi < cell.vertices.length; ++vi) {
				cell.vertices[vi] = gm.mul_mat4x3_vec4(xf, gm.vec4(cell.template.vertices[vi], 1));
			}
			cell.xform = xf; //remember for yarn drawing later
		}
	}
	check() { } //consistency check (connections point both directions)
	static fromArrayBuffer(buffer, library) {
		const text = new TextDecoder("utf-8").decode(buffer);
		const json = stripComments(text);
		const data = JSON.parse(json);
		return Body.fromData(data, library);
	}
	toData() {
		let data = [];
		//for convenience:
		for (let i = 0; i < this.cells.length; ++i) {
			this.cells[i].index = i;
		}

		for (const cell of this.cells) {
			const template = cell.template.signature();
			const vertices = [];
			for (const v of cell.vertices) {
				vertices.push([v[0], v[1], v[2]]);
			}
			const connections = [];
			for (const con of cell.connections) {
				if (con === null) {
					connections.push(null);
				} else {
					connections.push({cell:con.cell.index, face:con.face});
				}
			}
			data.push({template, vertices, connections});
		}

		for (const cell of this.cells) {
			delete cell.index;
		}
		return data;
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
			let xform = gm.rigidTransform(template.vertices, vertices);

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

			body.cells.push(new Cell({template, vertices, connections, xform}));
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
		connections,
		xform
	}) {
		if (!(template instanceof Template)) throw new Error("Cell's template must be a Template");
		if (!(template.vertices.length === vertices.length)) throw new Error("Should have as many vertices as template.");
		if (!(template.faces.length === connections.length)) throw new Error("Should have as many connections as template.faces .");
		if (!(Array.isArray(xform) && xform.length === 4*3)) throw new Error("Should have a 4x3 rigid xform.");


		this.template = template;
		this.vertices = vertices;
		this.connections = connections; //connections have "cell" (reference) and "face" (index)
		this.xform = xform;

		//should be the case that:
		//this.connections[0].block.connections[ this.connections[0].face ] === this

	}
	//generate from a template given some transform:
	static fromTemplate(template, xform = gm.mat4x3(1)) {

		//vertices are a transformed copy of the template's vertices:
		let vertices = [];
		for (let vertex of template.vertices) {
			vertices.push(gm.mul_mat4x3_vec4(xform, gm.vec4(vertex,1)));
		}

		//connections are a list of blank connections:
		let connections = [];
		for (let face of template.faces) {
			connections.push(null);
		}

		const cell = new Cell({template, vertices, connections, xform:gm.mat4x3(xform)});

		return cell;
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
		for (let i = 0; i < vertices.length; ++i) {
			this.vertices.push(toVec3(`Template.vertices[${i}]`, vertices[i]));
		}
		for (let i = 1; i < this.vertices.length; ++i) {
			const a = this.vertices[i-1];
			const b = this.vertices[i];
			if (a[0] < b[0]
			 || (a[0] === b[0] && a[1] < b[1])
			 || (a[0] === b[0] && a[1] === b[1] && a[2] < b[2])) {
				//great, a < b
			} else {
				throw new Error(`Vertices ${a} and ${b} are not ordered by x,y,z.`);
			}
		}

		//faces should be objects with a 'type', 'indices', 'direction', and 'color':
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
			if (!(faces[i].direction === 1 || faces[i].direction === -1)) throw new Error(`Template.faces[${i}].direction should be in {-1,1}.`);
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

		//compute a normal direction + a center point for the faces (used when making yarn weights):
		for (const face of this.faces) {
			let center = gm.vec3(0);
			for (let i = 0; i < face.indices.length; ++i) {
				center = gm.add(center, this.vertices[face.indices[i]]);
			}
			center = gm.scale(1 / face.indices.length, center);
			face.center = center;
			let normal = gm.vec3(0);
			for (let i = 0; i < face.indices.length; ++i) {
				const a = this.vertices[face.indices[i]];
				const b = this.vertices[face.indices[(i+1)%face.indices.length]];
				normal = gm.add(normal, gm.cross(gm.sub(b,a), gm.sub(center,a)));
			}
			normal = gm.normalize(normal);
			face.normal = normal;
		}

		//yarns:
		this.yarns = yarns;

		for (let yarn of this.yarns) {
			initYarn(this,yarn);
		}

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

function initYarn(template,yarn) {
	let pts = [];
	function splineTo(p1,p2,p3) {
		const p0 = pts[pts.length-1];
		for (let i = 1; i < 10; ++i) {
			const t = i / 10.0;
			const p01 = gm.mix(p0, p1, t);
			const p12 = gm.mix(p1, p2, t);
			const p23 = gm.mix(p2, p3, t);
			const p012 = gm.mix(p01, p12, t);
			const p123 = gm.mix(p12, p23, t);
			const p = gm.mix(p012, p123, t);
			pts.push(p);
		}
		pts.push(p3);
	}
	pts.push(toVec3(`cps[0]`, yarn.cps[0]));
	for (let i = 3; i < yarn.cps.length; i += 3) {
		splineTo(toVec3(`cps[${i-2}]`, yarn.cps[i-2]), toVec3(`cps[${i-1}]`, yarn.cps[i-1]), toVec3(`cps[${i}]`, yarn.cps[i]));
	}
	yarn.pts = pts;
}

function toVec3(what, val) {
	if (!Array.isArray(val)
	 || val.length !== 3
	 || !val.every( (v) => typeof v === 'number' ) ) throw new Error(`${what} is not an array of 3 numbers.`);
	return gm.vec3(val[0], val[1], val[2]);
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
