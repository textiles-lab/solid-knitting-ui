import * as gm from './gm.mjs';

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
				vertices.push(new gm.Vec4(vertex, 1));
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
				for (let i = 0; i < face.indices.length; ++i) {
					union(cell.viBase + face.indices[i], cell2.viBase + face2.indices[(L + 1 - i) % L]);
				}
			}
		}
		//TODO: also connections to construction grid?

		//average vertex sets:
		for (let v = 0; v < vertices.length; ++v) {
			const s = find(v);
			if (s === v) {
				//last in set; divide
				vertices[v].x /= vertices[v].a;
				vertices[v].y /= vertices[v].a;
				vertices[v].z /= vertices[v].a;
				delete vertices[v].a; //mark division as already done
			} else {
				//accumulate
				console.assert('a' in vertices[s]);
				console.assert('a' in vertices[v]);
				vertices[s].x += vertices[v].x;
				vertices[s].y += vertices[v].y;
				vertices[s].z += vertices[v].z;
				vertices[s].a += vertices[v].a;
			}
		}

		//fit new cell locations (+ TODO: rotations) to averaged points:
		for (const cell of this.cells) {
			//copy vertices:
			for (let vi = 0; vi < cell.vertices.length; ++vi) {
				const target = vertices[find(cell.viBase + vi)];
				cell.vertices[vi] = new gm.Vec3(target);
			}
			const xf = gm.rigidTransform(cell.template.vertices, cell.vertices);
			for (let vi = 0; vi < cell.vertices.length; ++vi) {
				cell.vertices[vi] = gm.mul(xf, new gm.Vec4(cell.template.vertices[vi], 1));
			}
		}
	}
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
		this.connections = connections; //connections have "cell" (reference) and "face" (index)

		//should be the case that:
		//this.connections[0].block.connections[ this.connections[0].face ] === this

	}
	//generate from a template given some transform:
	static fromTemplate(template, xform = new gm.Mat4x3(1)) {

		//vertices are a transformed copy of the template's vertices:
		let vertices = [];
		for (let vertex of template.vertices) {
			vertices.push(gm.mul(xform, new gm.Vec4(vertex,1)));
		}

		//connections are a list of blank connections:
		let connections = [];
		for (let face of template.faces) {
			connections.push(null);
		}

		return new Cell({template, vertices, connections});
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

		//compute a normal direction + a center point for the faces (used when making yarn weights):
		for (const face of this.faces) {
			let center = new gm.Vec3(0);
			for (let i = 0; i < face.indices.length; ++i) {
				center = gm.add(center, this.vertices[face.indices[i]]);
			}
			center = gm.mul(1 / face.indices.length, center);
			face.center = center;
			let normal = new gm.Vec3(0);
			for (let i = 0; i < face.indices.length; ++i) {
				const a = this.vertices[face.indices[i]];
				const b = this.vertices[face.indices[(i+1)%face.indices.length]];
				normal = gm.add(normal, gm.cross(gm.sub(b,a), gm.sub(center,a)));
			}
			normal = gm.normalize(normal);
			face.normal = normal;
		}

		//yarns: format somewhat TBD at the moment
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

	//also compute weights for the points -- i.e., their coordinates as a linear combination of the vertices.

	
	function normalizedDistanceWeights(dis) {
		let prefixProduct = [];
		let product = 1;
		for (let i = 0; i < dis.length; ++i) {
			product *= dis[i];
			prefixProduct.push(product);
		}

		let suffixProduct = [];
		product = 1;
		for (let i = dis.length-1; i >= 0; --i) {
			product *= dis[i];
			suffixProduct.unshift(product);
		}

		let weights = [];
		let sum = 0;
		for (let i = 0; i < dis.length; ++i) {
			//compute 1/d weights scaled by the product of the distances:
			let weight = 1;
			if (i > 0) weight *= prefixProduct[i-1];
			if (i + 1 < dis.length) weight *= suffixProduct[i+1];

			weights.push( weight );
			sum += weight;
		}
		if (sum < 1e-3) {
			console.log("Had case where two or more distances were nearly zero -- bailing out to equal weighting.");
			sum = 0;
			let min = Math.min(...dis);
			for (let i = 0; i < dis.length; ++i) {
				if (dis[i] == min) weights[i] = 1;
				else weights[i] = 0;
				sum += weights[i];
			}
		}
		//now the normalization:
		for (let i = 0; i < dis.length; ++i) {
			weights[i] /= sum;
		}
		return weights;
	}

	function makeFaceWeights(face, pt) {
		//per-edge distances:
		let edgeDis = [];
		let edgeAlong = [];
		for (let i = 0; i < face.indices.length; ++i) {
			const a = template.vertices[face.indices[i]];
			const b = template.vertices[face.indices[(i+1)%face.indices.length]];
			const ab = gm.sub(b,a);
			const length2 = gm.dot(ab,ab);
			const along = Math.max(0, Math.min(length2, gm.dot(gm.sub(pt,a),ab) )) / length2;
			const close = gm.mix(a,b,along);
			const dis = gm.length(close);
			edgeDis.push(dis);
			edgeAlong.push(along);
		}
		let edgeWeight = normalizedDistanceWeights(edgeDis);
		let weights = [];
		for (let i = 0; i < template.vertices.length; ++i) {
			weights.push(0);
		}
		for (let i = 0; i < face.indices.length; ++i) {
			const ai = face.indices[i];
			const bi = face.indices[(i+1)%face.indices.length];
			const along = edgeAlong[i];
			const weight = edgeWeight[i];
			weights[ai] += weight * (1 - along);
			weights[bi] += weight * along;
		}

		return weights;
	}

	function makeWeights(pt) {
		//per-face weights and a weighting factor:
		let faceDis = [];
		let faceWeights = [];
		for (let f = 0; f < template.faces.length; ++f) {
			const face = template.faces[f];
			const dis = gm.dot(gm.sub(pt, face.center), face.normal);
			const projected = gm.sub(pt, gm.mul(dis, face.normal));
			faceDis.push(Math.abs(dis));
			faceWeights.push(makeFaceWeights(face, pt));
		}
		let faceInvDis = normalizedDistanceWeights(faceDis);

		//compute final weights:
		let weights = [];
		for (let i = 0; i < template.vertices.length; ++i) {
			let w = 0;
			for (let f = 0; f < faceWeights.length; ++f) {
				w += faceInvDis[f] * faceWeights[f][i];
			}
			weights.push(w);
		}

		return weights;
	}

	let ptWeights = [];
	for (const pt of pts) {
		const weights = makeWeights(pt);
		let sum = 0;
		for (const w of weights) {
			sum += w;
		}
		if (Math.abs(sum - 1.0) > 1e-3) {
			console.log(`Weights sum to ${sum}, expected 1.0!`);
		}
		ptWeights.push(weights);
	}
	yarn.ptWeights = ptWeights;
}

function toVec3(what, val) {
	if (!Array.isArray(val)
	 || val.length !== 3
	 || !val.every( (v) => typeof v === 'number' ) ) throw new Error(`${what} is not an array of 3 numbers.`);
	return new gm.Vec3(val[0], val[1], val[2]);
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
