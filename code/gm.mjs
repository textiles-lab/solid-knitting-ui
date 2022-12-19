'use strict'; //likely to be redundant since this is a module

//vector math which somewhat resembles:
// https://www.khronos.org/opengl/wiki/Data_Type_(GLSL)#Constructors_and_initializers
//
// though no operator overloading so ... not quite

//Thought:
// what operator style works better?
// a = new Vec3(0,0,1);
// b = new Vec3(1,0,0);
// c = new Vec3(0,1,1);
//
// cross(sub(b,a), sub(c,a))
// b.minus(a).cross(c.minus(a))
//
// I think 'global function' vs 'member function' is more readable.

//---- for handling various argument styles ---

//helper used by constructors of sized vectors:
// shallow-flattens the first 'limit' values of args.
// args should be an iterable of numbers or iterables of numbers.
// it is an error to not supply enough data or to supply any argument that isn't (at least partially) used.
//(special case: if args is single number, replicates to fill)

//Examples of how this works:
//vec2(v) => flatten(2, [v]) => [v,v]
//vec3(x,y,z) => flatten(3, [x,y,z]) => [x,y,z]
//vec2(vec3(x,y,z)) => flatten(2, [[x,y,z]]) => [x,y]
//vec3(a, vec2(b,c)) => flatten(3, [a, [b,c]]) => [a,b,c]

function flatten(limit, args) {
	//special case: single number replicated to fill:
	if (args.length === 1 && typeof args[0] === 'number') {
		let rep = new Array(limit);
		rep.fill(args[0]);
		return rep;
	}
	//general case: flatten and check that there was enough data:
	let flat = [];
	for (const arg of args) {
		if (flat.length === limit) throw new Error("vec must not have any completely unused number or iterable in constructor");
		if (typeof arg === 'number') {
			flat.push(arg);
		} else if (typeof arg[Symbol.iterator] === 'function') {
			for (const v of arg) {
				if (typeof arg !== 'number') new Error("vec must be constructed from numbers and iterables of numbers");
				flat.push(v);
				if (flat.length === limit) break;
			}
		} else {
			throw new Error("vec must be constructed from numbers and iterables of numbers");
		}
	}
	if (flat.length < limit) throw new Error("vec constructed from insufficient components");
	console.assert(flat.length === limit);
	return flat;
}

//---- for adding aliases for particular elements to vector ---

function addAliases(cls, dim) {
	for (const NAMES of [ "xyzw", "rgba", "stpq" ]) {
		for (let i = 0; i < dim; ++i) {
			Object.defineProperty(cls.prototype, NAMES[i], {
				get() { return this[i]; },
				set(v) { this[i] = v; }
			});
		}
	}
}

//---- vector types ----
//TODO: transition to "rest parameters" ( i.e., constructor(a,b,...from) )

class Vec extends Array {
	constructor() {
		super();
		this.push(...arguments);
	}
}

export class Vec2 extends Vec {
	constructor() {
		super(...flatten(2, arguments));
	}
}
addAliases(Vec2, 2);

export class Vec3 extends Vec {
	constructor() {
		super(...flatten(3, arguments));
	}
}
addAliases(Vec3, 3);

export class Vec4 extends Vec {
	constructor() {
		super(...flatten(4, arguments));
	}
}
addAliases(Vec4, 4);

const VEC = [undefined, undefined, Vec2, Vec3, Vec4]; //for promoting after multiplication

//---- matrix types ----

//matrices follow glsl in being stored in column-major order

class Mat extends Array {
	constructor(columns, rows, ...data) {
		if (typeof rows !== 'number' || Math.round(rows) !== rows || rows <= 0
		 || typeof columns !== 'number' || Math.round(columns) !== columns || columns <= 0) throw new Error("Mat requires rows, columns to be positive integers.");
		super();
		Object.defineProperty(this, 'columns', { value:columns, writable:false });
		Object.defineProperty(this, 'rows', { value:rows, writable:false });
		this.push(...data);
	};
	//pretty-printable string (multi-line!):
	toString() {
		let out = [];
		for (let r = 0; r < this.rows; ++r) {
			out.push('[ ');
		}
		for (let c = 0; c < this.columns; ++c) {
			let col = [];
			let len = 0;
			for (let r = 0; r < this.rows; ++r) {
				const s = this[c * this.rows + r].toString();
				col.push(s);
				len = Math.max(len, s.length);
			}
			for (let r = 0; r < this.rows; ++r) {
				let s = col[r];
				while (s.length < len) s += ' ';
				out[r] += s + ' ';
			}
		}
		for (let r = 0; r < this.rows; ++r) {
			out[r] += ']';
		}
		return out.join('\n');
	}
	//convert to a Quat that does the same thing as rotating by this matrix (must be a Mat3):
	toQuat() {
		if (!(this.rows == 3 && this.columns == 3)) throw new Error("Mat.toQuat only valid on Mat3!");

		//This is copied (without must thinking) from GLM:
		// https://github.com/g-truc/glm/blob/fc8f4bb442b9540969f2f3f351c4960d91bca17a/glm/gtc/quaternion.inl#L81-L123
	
		const fourXSquaredMinus1 = this[0*3+0] - this[1*3+1] - this[2*3+2];
		const fourYSquaredMinus1 = this[1*3+1] - this[0*3+0] - this[2*3+2];
		const fourZSquaredMinus1 = this[2*3+2] - this[0*3+0] - this[1*3+1];
		const fourWSquaredMinus1 = this[0*3+0] + this[1*3+1] + this[2*3+2];

		let biggestIndex = 0;
		let fourBiggestSquaredMinus1 = fourWSquaredMinus1;

		if (fourXSquaredMinus1 > fourBiggestSquaredMinus1) {
			fourBiggestSquaredMinus1 = fourXSquaredMinus1;
			biggestIndex = 1;
		}
		if(fourYSquaredMinus1 > fourBiggestSquaredMinus1) {
			fourBiggestSquaredMinus1 = fourYSquaredMinus1;
			biggestIndex = 2;
		}
		if(fourZSquaredMinus1 > fourBiggestSquaredMinus1) {
			fourBiggestSquaredMinus1 = fourZSquaredMinus1;
			biggestIndex = 3;
		}

		const biggestVal = Math.sqrt(fourBiggestSquaredMinus1 + 1) * 0.5;
		const mult = 0.25 / biggestVal;

		switch(biggestIndex) {
		case 0:
			return new Quat((this[1*3+2] - this[2*3+1]) * mult, (this[2*3+0] - this[0*3+2]) * mult, (this[0*3+1] - this[1*3+0]) * mult, biggestVal);
		case 1:
			return new Quat(biggestVal, (this[0*3+1] + this[1*3+0]) * mult, (this[2*3+0] + this[0*3+2]) * mult, (this[1*3+2] - this[2*3+1]) * mult);
		case 2:
			return new Quat((this[0*3+1] + this[1*3+0]) * mult, biggestVal, (this[1*3+2] + this[2*3+1]) * mult, (this[2*3+0] - this[0*3+2]) * mult);
		case 3:
			return new Quat((this[2*3+0] + this[0*3+2]) * mult, (this[1*3+2] + this[2*3+1]) * mult, biggestVal, (this[0*3+1] - this[1*3+0]) * mult);
		}
		console.assert(false, "Should never reach this point.");

	}
}

//helper:
// flatten data to be stored into a column-major matrix.
//  single scalar argument: put on matrix diagonal
//  single matrix argument: copy from matrix, fill rest from identity
//  multiple vec/number arguments: copy in order into columns
//   - too few elements is an error
//   - too many elements is an error
function matFlatten(columns, rows, args) {
	//special case: single number replicated to diagonal:
	if (args.length === 1 && typeof args[0] === 'number') {
		let rep = new Array(columns * rows);
		for (let col = 0; col < columns; ++col) {
			for (let row = 0; row < rows; ++row) {
				rep[col * rows + row] = (col === row ? args[0] : 0.0);
			}
		}
		return rep;
	}
	//special case: copy matrix:
	if (args.length === 1 && args[0] instanceof Mat) {
		const m = args[0];
		let rep = new Array(columns * rows);
		for (let col = 0; col < columns; ++col) {
			for (let row = 0; row < rows; ++row) {
				if (col < m.columns && row < m.rows) {
					rep[col * rows + row] = m[col * m.rows + row];
				} else {
					rep[col * rows + row] = (col === row ? 1.0 : 0.0);
				}
			}
		}
		return rep;
	}
	const limit = columns * rows;
	//general case: flatten and check that there was exactly enough data:
	let flat = [];
	for (const arg of args) {
		if (flat.length === limit) throw new Error("mat must have exactly the right amount of data in constructor");
		if (typeof arg === 'number') {
			flat.push(arg);
		} else if (arg instanceof Mat) {
			throw new Error("mat can't be flattened in matrix constructor");
		} else if (typeof arg[Symbol.iterator] === 'function') {
			for (const v of arg) {
				if (flat.length === limit) throw new Error("mat must have exactly the right amount of data in constructor");
				if (typeof arg !== 'number') new Error("mat must be constructed from numbers and iterables of numbers");
				flat.push(v);
			}
		} else {
			throw new Error("mat must be constructed from numbers and iterables of numbers");
		}
	}
	if (flat.length < limit) throw new Error("mat constructed from insufficient components");
	console.assert(flat.length === limit);
	return flat;

}

export class Mat2x2 extends Mat {
	constructor(...data) {
		super(2,2, ...matFlatten(2,2,data));
	}
}

export const Mat2 = Mat2x2;

export class Mat2x3 extends Mat {
	constructor(...data) {
		super(2,3, ...matFlatten(2,3,data));
	}
}

export class Mat2x4 extends Mat {
	constructor(...data) {
		super(2,4, ...matFlatten(2,4,data));
	}
}

export class Mat3x2 extends Mat {
	constructor(...data) {
		super(3,2, ...matFlatten(3,2,data));
	}
}

export class Mat3x3 extends Mat {
	constructor(...data) {
		super(3,3, ...matFlatten(3,3,data));
	}
}

export const Mat3 = Mat3x3;

export class Mat3x4 extends Mat {
	constructor(...data) {
		super(3,4, ...matFlatten(3,4,data));
	}
}

export class Mat4x2 extends Mat {
	constructor(...data) {
		super(4,2, ...matFlatten(4,2,data));
	}
}

export class Mat4x3 extends Mat {
	constructor(...data) {
		super(4,3, ...matFlatten(4,3,data));
	}
}

export class Mat4x4 extends Mat {
	constructor(...data) {
		super(4,4, ...matFlatten(4,4,data));
	}
}
export const Mat4 = Mat4x4;

const MAT = [
	[], //0x
	[], //1x
	[undefined, undefined, Mat2, Mat2x3, Mat2x4],
	[undefined, undefined, Mat3x2, Mat3, Mat3x4],
	[undefined, undefined, Mat4x2, Mat4x3, Mat4]
];

//matrix-specific functions:
function transpose(m) {
	if (!(m instanceof Mat)) throw new Error(`The transpose() function only works on matrices.`);
	//produce transposed data array:
	let data = new Array(m.rows * m.columns);
	for (let c = 0; c < m.columns; ++c) {
		for (let r = 0; r < m.rows; ++r) {
			data[r * m.columns + c] = m[c * m.rows + r];
		}
	}
	//build new matrix with transposed data:
	return new MAT[m.rows][m.columns](...data);
}

//---- quaternion types ----

export class Quat extends Array {
	constructor() {
		super();
		if (arguments.length === 0) {
			this.push(0,0,0,1);
		} else if (arguments.length === 4) {
			for (let i = 0; i < 4; ++i) {
				if (typeof arguments[i] !== 'number') throw new Error(`Expected number for ${"xyzw"[i]}; got ${arguments[i]} (${typeof arguments[i]}) instead.`);
			}
			this.push(...arguments);
		} else {
			throw new Error(`You must construct Quat from either zero arguments or four arguments (x,y,z,w)`);
		}
	}

	//convert to a Mat3 that does the same thing as rotating by this quaternion:
	toMat3() {
		//based (very literally) on GLM's quaternion-to-mat3:
		//  https://github.com/g-truc/glm/blob/fc8f4bb442b9540969f2f3f351c4960d91bca17a/glm/gtc/quaternion.inl#L46-L72

		const qxx = this.x * this.x;
		const qxy = this.x * this.y;
		const qxz = this.x * this.z;
		const qyy = this.y * this.y;
		const qyz = this.y * this.z;
		const qzz = this.z * this.z;
		const qwx = this.w * this.x;
		const qwy = this.w * this.y;
		const qwz = this.w * this.z;

		return new Mat3(
			1 - 2 * (qyy + qzz),
			2 * (qxy + qwz),
			2 * (qxz - qwy),

			2 * (qxy - qwz),
			1 - 2 * (qxx + qzz),
			2 * (qyz + qwx),

			2 * (qxz + qwy),
			2 * (qyz - qwx),
			1 - 2 * (qxx + qyy)
		);
	}
}

{ //add x,y,z,w aliases to Quat:
	const NAMES = "xyzw";
	for (let i = 0; i < 4; ++i) {
		Object.defineProperty(Quat.prototype, NAMES[i], {
			get() { return this[i]; },
			set(v) { this[i] = v; }
		});
	}
}


//---- math functions ----
export function min(a,b) {
	if (a instanceof Vec && b instanceof Vec) {
		if (a.length !== b.length) throw new Error(`Can't min vectors of length ${a.length} != ${b.length}.`);
		const c = new a.constructor(a);
		for (let i = 0; i < c.length; ++i) {
			c[i] = Math.min(c[i], b[i]);
		}
		return c;
	} else {
		throw new Error(`Don't know how to min ${a.constructor.name} and ${b.constructor.name}.`);
	}
}

export function max(a,b) {
	if (a instanceof Vec && b instanceof Vec) {
		if (a.length !== b.length) throw new Error(`Can't max vectors of length ${a.length} != ${b.length}.`);
		const c = new a.constructor(a);
		for (let i = 0; i < c.length; ++i) {
			c[i] = Math.max(c[i], b[i]);
		}
		return c;
	} else {
		throw new Error(`Don't know how to max ${a.constructor.name} and ${b.constructor.name}.`);
	}
}

export function add(a,b) {
	if (a instanceof Vec && b instanceof Vec) {
		if (a.length !== b.length) throw new Error(`Can't add vectors of length ${a.length} != ${b.length}.`);
		const c = new a.constructor(a);
		for (let i = 0; i < c.length; ++i) {
			c[i] += b[i];
		}
		return c;
	} else {
		throw new Error(`Don't know how to add ${a.constructor.name} and ${b.constructor.name}.`);
	}
}

export function sub(a,b) {
	if (a instanceof Vec && b instanceof Vec) {
		if (a.length !== b.length) throw new Error(`Can't subtract vectors of length ${a.length} != ${b.length}.`);
		const c = new a.constructor(a);
		for (let i = 0; i < c.length; ++i) {
			c[i] -= b[i];
		}
		return c;
	} else {
		throw new Error(`Don't know how to subtract ${a.constructor.name} and ${b.constructor.name}.`);
	}
}

export function mul(a,b) {
	// mat * mat
	if (a instanceof Mat && b instanceof Mat) {
		if (a.columns !== b.rows) throw new Error(`Can't multiply ${a.constructor.name} (${a.columns} columns) by ${b.constructor.name} (${b.rows} rows).`);
		let data = [];
		for (let col = 0; col < b.columns; ++col) {
			for (let row = 0; row < a.rows; ++row) {
				let val = 0;
				for (let k = 0; k < a.columns; ++k) {
					val += a[k * a.rows + row] * b[col * b.rows + k];
				}
				data.push(val);
			}
		}
		return new MAT[b.columns][a.rows](...data);
	// mat * vec
	} else if (a instanceof Mat && b instanceof Vec) {
		if (a.columns !== b.length) throw new Error(`Can't multiply ${a.constructor.name} (${a.columns} columns) by ${b.constructor.name} (${b.length} elements).`);
		let data = [];
		for (let row = 0; row < a.rows; ++row) {
			let val = 0;
			for (let k = 0; k < a.columns; ++k) {
				val += a[k * a.rows + row] * b[k];
			}
			data.push(val);
		}
		//(TODO: could promote to a VecN class here)
		return new VEC[data.length](...data);
	// quat * quat
	} else if (a instanceof Quat && b instanceof Quat) {
		//as per GLM: https://github.com/g-truc/glm/blob/b3f87720261d623986f164b2a7f6a0a938430271/glm/detail/type_quat.inl#L282-L292
		//(with modification because we use xyzw for quat construction and storage order)
		return new Quat(
			a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
			a.w * b.y + a.y * b.w + a.z * b.x - a.x * b.z,
			a.w * b.z + a.z * b.w + a.x * b.y - a.y * b.x,
			a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
		);
	// number * quat
	} else if (typeof a === 'number' && b instanceof Quat) {
		const c = new b.constructor(b.x, b.y, b.z, b.w);
		for (let i = 0; i < c.length; ++i) {
			c[i] *= a;
		}
		return c;
	// quat * number
	} else if (a instanceof Quat && typeof b === 'number') {
		return mul(b, a);
	// vecN * vecN:
	} else if (a instanceof Vec && b instanceof Vec) {
		if (a.length !== b.length) throw new Error(`Can't multiply vectors of length ${a.length} != ${b.length}.`);
		const c = new a.constructor(a);
		for (let i = 0; i < c.length; ++i) {
			c[i] -= b[i];
		}
		return c;
	// number * vecN:
	} else if (typeof a === 'number' && b instanceof Vec) {
		const c = new b.constructor(b);
		for (let i = 0; i < c.length; ++i) {
			c[i] *= a;
		}
		return c;
	// vecN * number:
	} else if (a instanceof Vec && typeof b === 'number') {
		return mul(b,a);
	} else {
		throw new Error(`Don't know how to multiply ${a.constructor.name} and ${b.constructor.name}.`);
	}
}

export function mix(a,b,amt) {
	if (a instanceof Vec && b instanceof Vec) {
		if (a.length !== b.length) throw new Error(`Can't min vectors of length ${a.length} != ${b.length}.`);
		const c = new a.constructor(a);
		for (let i = 0; i < c.length; ++i) {
			c[i] += (b[i] - c[i]) * amt;
		}
		return c;
	} else {
		throw new Error(`Don't know how to mix ${a.constructor.name} and ${b.constructor.name}.`);
	}
}


export function dot(a,b) {
	if (a instanceof Vec && b instanceof Vec) {
		if (a.length !== b.length) throw new Error(`Can't dot vectors of length ${a.length} != ${b.length}.`);
		let result = 0;
		for (let i = 0; i < a.length; ++i) {
			result += a[i] * b[i];
		}
		return result;
	} else if (a instanceof Quat && b instanceof Quat) {
		let result = 0;
		for (let i = 0; i < 4; ++i) {
			result += a[i] * b[i];
		}
		return result;
	} else {
		throw new Error(`Don't know how to dot ${a.constructor.name} and ${b.constructor.name}.`);
	}
}

export function cross(a,b) {
	if (a instanceof Vec3 && b instanceof Vec3) {
		return new Vec3(
			a[1] * b[2] - a[2] * b[1],
			a[2] * b[0] - a[0] * b[2],
			a[0] * b[1] - a[1] * b[0]
		);
	} else {
		throw new Error(`Don't know how to cross ${a.constructor.name} and ${b.constructor.name}.`);
	}
}

export function normalize(a) {
	const len = Math.sqrt(dot(a,a));
	return mul(1.0 / len, a);
}


export function length(a) {
	return Math.sqrt(dot(a,a));
}

export function svd(A_) {
	if (!(A_ instanceof Mat && A_.rows === 3 && A_.columns === 3)) throw new Error("This svd code only works on 3x3 matricies.");

	//tolerances used to stop iteration (...well, okay, not in the current version, but someday)
	const tol = 1e-4;
	const tol2 = tol*tol;

	//inefficient SVD!
	// based on the standard method described in the introductory sections of:
	//  https://pages.cs.wisc.edu/~sifakis/project_pages/svd.html

	let A = new Mat3(A_);
	let S = mul(transpose(A), A);
	let V = new Quat();

	//Return c,s that diagonalize a symmetric matrix:
	// [ c s ] * [a11 a12] * [c -s] = [ x 0 ]
	// [-s c ]   [a12 a22]   [s  c]   [ 0 y ]
	function givens_cs(a11, a12, a22) {
		const den = a11-a22;
		let theta;
		if (den === 0) theta = 0.25 * Math.PI;
		else theta = 0.5 * Math.atan(2 * a12 / den);
		const c = Math.cos(theta);
		const s = Math.sin(theta);
		//console.log(`Should be zero: ${c*s*(a22-a11) + (c*c - s*s) * a12}`);
		return {c,s};
	}

	//Iteratively reduce off-diagonals: (determines V)
	for (let iter = 0; iter < 10; ++iter) {
		const remain = mul( transpose(V.toMat3()), mul(S, V.toMat3()) );
		//console.log(`remain:\n${remain.toString()}`); //DEBUG
		const r01 = Math.abs(remain[0 * 3 + 1])
		const r02 = Math.abs(remain[0 * 3 + 2])
		const r12 = Math.abs(remain[1 * 3 + 2])
		let Q;
		if (r01 === 0 && r02 === 0 && r12 === 0) break;
		if (r01 >= r02 && r01 >= r12) {
			const {c,s} = givens_cs(remain[0*3+0], remain[0*3+1], remain[1*3+1]);
			Q = new Mat3(
				c,  s, 0,
				-s, c, 0,
				0,  0, 1
			);
		} else if (r02 >= r12) {
			const {c,s} = givens_cs(remain[0*3+0], remain[0*3+2], remain[2*3+2]);
			Q = new Mat3(
				c,  0, s,
				0,  1, 0,
				-s, 0, c
			);
		} else { //r12 is largest off-diagonal.
			const {c,s} = givens_cs(remain[1*3+1], remain[1*3+2], remain[2*3+2]);
			Q = new Mat3(
				1, 0, 0,
				0, c, s,
				0,-s, c
			);
		}
		V = normalize(mul(V, Q.toQuat()));
		//console.log("remain:\n" + mul(transpose(V.toMat3()), mul(S, V.toMat3())).toString()); //DEBUG
	}
	//console.log(A.toString())
	//console.log(mul(A, V.toMat3()).toString());

	{ //Sort the singular values:
		let B = mul(A, V.toMat3());
		//magnitudes of singular values are magnitudes of column vectors of B:
		let s = [
			B[0*3+0] * B[0*3+0] + B[0*3+1] * B[0*3+1] + B[0*3+2] * B[0*3+2],
			B[1*3+0] * B[1*3+0] + B[1*3+1] * B[1*3+1] + B[1*3+2] * B[1*3+2],
			B[2*3+0] * B[2*3+0] + B[2*3+1] * B[2*3+1] + B[2*3+2] * B[2*3+2]
		];
		if (s[0] < s[1]) {
			[s[1], s[0]] = [s[0], s[1]];
			//rotate by:
			// [ 0 -1 0 ]
			// [ 1  0 0 ]
			// [ 0  0 1 ]
			//NOTE: by avoiding normalization could do this mul() much more efficiently!
			V = mul(V, new Quat(0, 0, Math.SQRT1_2, Math.SQRT1_2));
		}
		//DEBUG: shouldn't need to recompute:
		if (s[0] < s[2]) {
			[s[2], s[0]] = [s[0], s[2]];
			//rotate by:
			// [ 0 0  1 ]
			// [ 0 1  0 ]
			// [-1 0  0 ]
			//NOTE: by avoiding normalization could do this mul() much more efficiently!
			V = mul(V, new Quat(0, Math.SQRT1_2, 0, Math.SQRT1_2));
		}
		if (s[1] < s[2]) {
			[s[2], s[1]] = [s[1], s[2]];
			//rotate by:
			// [ 1 0  0 ]
			// [ 0 0 -1 ]
			// [ 0 1  0 ]
			//NOTE: by avoiding normalization could do this mul() much more efficiently!
			V = mul(V, new Quat(Math.SQRT1_2, 0, 0, Math.SQRT1_2));
		}
		/*
		B = mul(A, V.toMat3());
		s = [
			B[0*3+0] * B[0*3+0] + B[0*3+1] * B[0*3+1] + B[0*3+2] * B[0*3+2],
			B[1*3+0] * B[1*3+0] + B[1*3+1] * B[1*3+1] + B[1*3+2] * B[1*3+2],
			B[2*3+0] * B[2*3+0] + B[2*3+1] * B[2*3+1] + B[2*3+2] * B[2*3+2]
		];
		console.log(`s after: ${s}`);
		*/
	}

	//figure out U factor:
	let B = mul(A, V.toMat3());
	//console.log(`before:\n${B}`);
	function qr_cs(app, apq, aqq) {
		const den2 = aqq*aqq + apq*apq;
		if (den2 < tol2) {
			//if very small, rotate so sign of aqq is positive, ignoring off-diagonal:
			const c = (aqq >= 0 ? 1 : 0);
			const s = 0;
			return {c, s};
		} else {
			const den = Math.sqrt(den2);
			const c = aqq / den;
			const s = apq / den;
			return {c,s};
		}
	}
	let Q;
	{ //eliminate entry at c0 r1:
		const {c,s} = qr_cs(B[1*3+1], B[0*3+1], B[0*3+0]);
		Q = new Mat3(
			c,  s, 0,
			-s, c, 0,
			0,  0, 1
		);
		B = mul(transpose(Q), mul(A, V.toMat3()));
	}
	{ //eliminate entry at c0 r2:
		const {c,s} = qr_cs(B[2*3+2], B[0*3+2], B[0*3+0]);
		Q = mul(Q, new Mat3(
			c,  0, s,
			0,  1, 0,
			-s, 0, c
		));
		B = mul(transpose(Q), mul(A, V.toMat3()));
	}
	{ //eliminate entry at c1 r2:
		const {c,s} = qr_cs(B[2*3+2], B[1*3+2], B[1*3+1]);
		Q = mul(Q, new Mat3(
			1, 0, 0,
			0, c, s,
			0,-s, c
		));
		B = mul(transpose(Q), mul(A, V.toMat3()));
	}

	const U = normalize(Q.toQuat());
	const Sigma = new Mat3(B[0*3+0],0,0, 0,B[1*3+1],0, 0,0,B[2*3+2]);

	//console.log(`A:\n${A}`);
	//console.log(`U S Vt:\n${mul(mul(U.toMat3(), Sigma), transpose(V.toMat3()))}`);
	//console.log(`U:\n${U.toMat3()}\nS:\n${Sigma}\nV:\n${V.toMat3()}`);

	return {U, Sigma, V};
}

//rigid transform X such that minimizes ( X * [A[i],1] - B[i] ) ^ 2
// that is, the translation + rotation that get points in A as close as possible to their corresponding points in B
// return is a Mat4x3
export function rigidTransform(A,B) {
	if (A.length !== B.length) throw new Error("Point lists should be the same length.");

	//no points? return identity:
	if (A.length === 0) return new Mat4x3(1);

	//As per summary in:
	// https://igl.ethz.ch/projects/ARAP/svd_rot.pdf

	const L = A.length;

	let A_mean = A[0];
	let B_mean = B[0];
	for (let i = 1; i < L; ++i) {
		A_mean = add(A_mean, A[i]);
		B_mean = add(B_mean, B[i]);
	}
	A_mean = mul(1.0 / L, A_mean);
	B_mean = mul(1.0 / L, B_mean);

	//NOTE: for < 3 pts, could do some gentle regularization

	let S = new Mat3(0);
	for (let i = 0; i < L; ++i) {
		const a = sub(A[i],A_mean);
		const b = sub(B[i],B_mean);
		S[0*3+0] += a[0] * b[0];
		S[0*3+1] += a[1] * b[0];
		S[0*3+2] += a[2] * b[0];
		S[1*3+0] += a[0] * b[1];
		S[1*3+1] += a[1] * b[1];
		S[1*3+2] += a[2] * b[1];
		S[2*3+0] += a[0] * b[2];
		S[2*3+1] += a[1] * b[2];
		S[2*3+2] += a[2] * b[2];
	}

	const {U, Sigma, V} = svd(S);

	//NOTE: this multiplication would be more efficient betwixt U and V as quaternions:
	//const rot = mul(V.toMat3(), transpose(U.toMat3()));

	//HACK: actually ignore rotation:
	const rot = new Mat3(1);

	const translation = sub(B_mean, mul(rot, A_mean));

	//assemble the final transformation:
	const xform = new Mat4x3(rot); //rotation part
	//translation part:
	xform[3*3+0] = translation[0];
	xform[3*3+1] = translation[1];
	xform[3*3+2] = translation[2];

	return xform;
}
