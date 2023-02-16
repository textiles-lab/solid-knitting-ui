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
/*
function addAliases(obj, dim) {
	//does this slow things down?
	for (const NAMES of [ "xyzw", "rgba", "stpq" ]) {
		for (let i = 0; i < dim; ++i) {
			Object.defineProperty(obj, NAMES[i], {
				get() { return this[i]; },
				set(v) { this[i] = v; }
			});
		}
	}
}
*/

//---- vector types ----
//all vector types are just Arrays -- no extra parameters or anything.

export function vec2(...args) {
	let ret = [...flatten(2, args)];
	//addAliases(ret, 2);
	return ret;
}
//addAliases(Vec2, 2);

export function vec3(...args) {
	let ret = [...flatten(3, args)];
	//addAliases(ret, 3);
	return ret;
}
//addAliases(Vec3, 3);

export function copyVec3(v) {
	return vec3(v[0], v[1], v[2]);
}

export function vec4(...args) {
	let ret = [...flatten(4, args)];
	//addAliases(ret, 4);
	return ret;
}
//addAliases(Vec4, 4);

//---- matrix types ----
//matrices follow glsl in being stored in column-major order
// (...but are just arrays and you need to remember the dimensions yourself!)

class Mat extends Array {
	constructor(columns, rows, ...data) {
		if (typeof rows !== 'number' || Math.round(rows) !== rows || rows <= 0
		 || typeof columns !== 'number' || Math.round(columns) !== columns || columns <= 0) throw new Error("Mat requires rows, columns to be positive integers.");
		super();
		Object.defineProperty(this, 'columns', { value:columns, writable:false });
		Object.defineProperty(this, 'rows', { value:rows, writable:false });
		this.push(...data);
	};
}

//pretty-printable string (multi-line!):
export function mat_to_string(rows,columns, m) {
	let out = [];
	for (let r = 0; r < rows; ++r) {
		out.push('[ ');
	}
	for (let c = 0; c < columns; ++c) {
		let col = [];
		let len = 0;
		for (let r = 0; r < rows; ++r) {
			const s = m[c * rows + r].toString();
			col.push(s);
			len = Math.max(len, s.length);
		}
		for (let r = 0; r < rows; ++r) {
			let s = col[r];
			while (s.length < len) s += ' ';
			out[r] += s + ' ';
		}
	}
	for (let r = 0; r < rows; ++r) {
		out[r] += ']';
	}
	return out.join('\n');
}

//convert to a Quat that does the same thing as rotating by this a 3x3 matrix:
export function mat3_to_quat(m) {
	if (!(m.length === 9)) throw new Error("mat3_to_quat only valid on mat3!");

	//This is copied (without must thinking) from GLM:
	// https://github.com/g-truc/glm/blob/fc8f4bb442b9540969f2f3f351c4960d91bca17a/glm/gtc/quaternion.inl#L81-L123
	
	const fourXSquaredMinus1 = m[0*3+0] - m[1*3+1] - m[2*3+2];
	const fourYSquaredMinus1 = m[1*3+1] - m[0*3+0] - m[2*3+2];
	const fourZSquaredMinus1 = m[2*3+2] - m[0*3+0] - m[1*3+1];
	const fourWSquaredMinus1 = m[0*3+0] + m[1*3+1] + m[2*3+2];

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
		return [(m[1*3+2] - m[2*3+1]) * mult, (m[2*3+0] - m[0*3+2]) * mult, (m[0*3+1] - m[1*3+0]) * mult, biggestVal];
	case 1:
		return [biggestVal, (m[0*3+1] + m[1*3+0]) * mult, (m[2*3+0] + m[0*3+2]) * mult, (m[1*3+2] - m[2*3+1]) * mult];
	case 2:
		return [(m[0*3+1] + m[1*3+0]) * mult, biggestVal, (m[1*3+2] + m[2*3+1]) * mult, (m[2*3+0] - m[0*3+2]) * mult];
	case 3:
		return [(m[2*3+0] + m[0*3+2]) * mult, (m[1*3+2] + m[2*3+1]) * mult, biggestVal, (m[0*3+1] - m[1*3+0]) * mult];
	}
	console.assert(false, "Should never reach this point.");
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
	if (args.length === 1 && Array.isArray(args[0]) && ('rows' in args[0] && 'columns' in args[0])) {
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

export function mat2x2(...data) {
	return [...matFlatten(2,2,data)];
}

export const mat2 = mat2x2;

export function mat2x3(...data) {
	return [...matFlatten(2,3,data)];
}

export function mat2x4(...data) {
	return [...matFlatten(2,4,data)];
}

export function mat3x2(...data) {
	return [...matFlatten(3,2,data)];
}

export function mat3x3(...data) {
	return [...matFlatten(3,3,data)];
}

export const mat3 = mat3x3;

export function mat3x4(...data) {
	return [...matFlatten(3,4,data)];
}

export function mat4x2(...data) {
	return [...matFlatten(4,2,data)];
}

export function mat4x3(...data) {
	return [...matFlatten(4,3,data)];
}

export function mat4x4(...data) {
	return [...matFlatten(4,4,data)];
}
export const mat4 = mat4x4;

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

export function transpose_mat3(m) {
	if (!(m.length === 9)) throw new Error(`The transpose_mat3() function only works on 9-element arrays.`);
	const rows = 3;
	const columns = 3;
	//produce transposed data array:
	let data = new Array(rows * columns);
	for (let c = 0; c < columns; ++c) {
		for (let r = 0; r < rows; ++r) {
			data[r * columns + c] = m[c * rows + r];
		}
	}
	return data
}

//---- quaternion types ----

//quaternions are in 'xyzw' order!

//convert to a mat3 that does the same thing as rotating by a quaternion:
function quat_to_mat3(q) {
	//based (very literally) on GLM's quaternion-to-mat3:
	//  https://github.com/g-truc/glm/blob/fc8f4bb442b9540969f2f3f351c4960d91bca17a/glm/gtc/quaternion.inl#L46-L72

	const x = q[0];
	const y = q[1];
	const z = q[2];
	const w = q[3];

	const qxx = x * x;
	const qxy = x * y;
	const qxz = x * z;
	const qyy = y * y;
	const qyz = y * z;
	const qzz = z * z;
	const qwx = w * x;
	const qwy = w * y;
	const qwz = w * z;

	return [
		1 - 2 * (qyy + qzz),
		2 * (qxy + qwz),
		2 * (qxz - qwy),

		2 * (qxy - qwz),
		1 - 2 * (qxx + qzz),
		2 * (qyz + qwx),

		2 * (qxz + qwy),
		2 * (qyz - qwx),
		1 - 2 * (qxx + qyy)
	];
}

//---- math functions ----
export function min(a,b) {
	if (a.length !== b.length) throw new Error(`Can't min items of length ${a.length} != ${b.length}.`);
	const c = a.slice();
	for (let i = 0; i < c.length; ++i) {
		c[i] = Math.min(c[i], b[i]);
	}
	return c;
}

export function max(a,b) {
	if (a.length !== b.length) throw new Error(`Can't max items of length ${a.length} != ${b.length}.`);
	const c = a.slice();
	for (let i = 0; i < c.length; ++i) {
		c[i] = Math.max(c[i], b[i]);
	}
	return c;
}

export function add(a,b) {
	if (a.length !== b.length) throw new Error(`Can't add items of length ${a.length} != ${b.length}.`);
	const c = a.slice();
	for (let i = 0; i < c.length; ++i) {
		c[i] += b[i];
	}
	return c;
}

export function sub(a,b) {
	if (a.length !== b.length) throw new Error(`Can't subtract items of length ${a.length} != ${b.length}.`);
	const c = a.slice();
	for (let i = 0; i < c.length; ++i) {
		c[i] -= b[i];
	}
	return c;
}

export function scalarmul(s,v) {
	const c = v.slice();
	for (let i = 0; i < c.length; ++i) {
		c[i] *= s;
	}
	return c;
}

export function matmul(a_rows, a_columns, b_rows, b_columns, a,b) {
	if (a.length !== (a_columns * a_rows) || b.length !== (b_columns * b_rows)) throw new Error("arguments should match their sizes");
	if (a_columns !== b_rows) throw new Error(`Can't multiply ${a_rows}x${a_columns} by ${b_rows}x${b_columns}.`);

	let data = [];
	for (let col = 0; col < b_columns; ++col) {
		for (let row = 0; row < a_rows; ++row) {
			let val = 0;
			for (let k = 0; k < a_columns; ++k) {
				val += a[k * a_rows + row] * b[col * b_rows + k];
			}
			data.push(val);
		}
	}
	return data;
}


export function transform(m_rows, m_columns, m,v) {
	if (m.length !== (m_columns * m_rows)) throw new Error("arguments should match their sizes");
	if (m_columns !== v.length) throw new Error(`Can't multiply ${a_rows}x${a_columns} by ${b.length}-vector.`);
	
	let data = [];
	for (let row = 0; row < m_rows; ++row) {
		let val = 0;
		for (let k = 0; k < m_columns; ++k) {
			val += m[k * m_rows + row] * v[k];
		}
		data.push(val);
	}
	return data;
}

export function mul_mat3_vec3(a,b) {
	return transform(3,3, a,b);
}


export function mul_mat4x3_vec4(a,b) {
	return transform(3,4, a,b);
}



export function mul_mat3(a,b) {
	return matmul(3,3,3,3, a,b);
}

export function mul_quat(a,b) {
	if (a.length !== 4 || b.length !== 4) throw new Error("arguments should match their sizes");
	//as per GLM: https://github.com/g-truc/glm/blob/b3f87720261d623986f164b2a7f6a0a938430271/glm/detail/type_quat.inl#L282-L292
	//(with modification because we use xyzw for quat construction and storage order)
	return [
		a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
		a[3] * b[1] + a[1] * b[3] + a[2] * b[0] - a[0] * b[2],
		a[3] * b[2] + a[2] * b[3] + a[0] * b[1] - a[1] * b[0],
		a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
	];
}


export function scale(s,a) {
	const ret = a.slice();
	for (let i = 0; i < ret.length; ++i) {
		ret[i] *= s;
	}
	return ret;
}



/*
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
*/

export function mix(a,b,amt) {
	if (a.length !== b.length) throw new Error(`Can't mix vectors of length ${a.length} != ${b.length}.`);
	const c = a.slice();
	for (let i = 0; i < c.length; ++i) {
		c[i] += (b[i] - c[i]) * amt;
	}
	return c;
}

export function dot(a,b) {
	if (a.length !== b.length) throw new Error(`Can't dot vectors of length ${a.length} != ${b.length}.`);
	let result = 0;
	for (let i = 0; i < a.length; ++i) {
		result += a[i] * b[i];
	}
	return result;
}

export function cross(a,b) {
	if (!(a.length === 3 && b.length === 3)) new Error(`Don't know how to cross ${a.length} and ${b.length}.`);
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0]
	];
}

export function normalize(a) {
	const len = Math.sqrt(dot(a,a));
	const invLen = 1.0 / len;
	let ret = a.slice();
	for (let i = 0; i < a.length; ++i) {
		ret[i] *= invLen;
	}
	return ret;
}


export function length(a) {
	return Math.sqrt(dot(a,a));
}

export function length2(a) {
	return dot(a,a);
}

export function dist(a, b) {
	return length(sub(b, a));
}

export function dist2(a, b) {
	return length2(sub(b, a));
}

export function svd(A_) {
	if (!(A_.length === 9)) throw new Error("This svd code only works on 3x3 matricies.");

	//tolerances used to stop iteration (...well, okay, not in the current version, but someday)
	const tol = 1e-4;
	const tol2 = tol*tol;

	//inefficient SVD!
	// based on the standard method described in the introductory sections of:
	//  https://pages.cs.wisc.edu/~sifakis/project_pages/svd.html

	let A = A_.slice();
	let S = mul_mat3(transpose_mat3(A), A);
	let V = [0,0,0,1];

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
		const remain = mul_mat3( transpose_mat3(quat_to_mat3(V)), mul_mat3(S, quat_to_mat3(V)) );
		//console.log(`remain:\n${remain.toString()}`); //DEBUG
		const r01 = Math.abs(remain[0 * 3 + 1])
		const r02 = Math.abs(remain[0 * 3 + 2])
		const r12 = Math.abs(remain[1 * 3 + 2])
		let Q;
		if (r01 === 0 && r02 === 0 && r12 === 0) break;
		if (r01 >= r02 && r01 >= r12) {
			const {c,s} = givens_cs(remain[0*3+0], remain[0*3+1], remain[1*3+1]);
			Q = [
				c,  s, 0,
				-s, c, 0,
				0,  0, 1
			];
		} else if (r02 >= r12) {
			const {c,s} = givens_cs(remain[0*3+0], remain[0*3+2], remain[2*3+2]);
			Q = [
				c,  0, s,
				0,  1, 0,
				-s, 0, c
			];
		} else { //r12 is largest off-diagonal.
			const {c,s} = givens_cs(remain[1*3+1], remain[1*3+2], remain[2*3+2]);
			Q = [
				1, 0, 0,
				0, c, s,
				0,-s, c
			];
		}
		V = normalize(mul_quat(V, mat3_to_quat(Q)));
		//console.log("remain:\n" + mul(transpose(V.toMat3()), mul(S, V.toMat3())).toString()); //DEBUG
	}
	//console.log(A.toString()) //DEBUG
	//console.log(mul(A, V.toMat3()).toString()); //DEBUG

	{ //Sort the singular values:
		let B = mul_mat3(A, quat_to_mat3(V));
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
			V = mul_quat(V, [0, 0, Math.SQRT1_2, Math.SQRT1_2]);
		}
		//DEBUG: shouldn't need to recompute:
		if (s[0] < s[2]) {
			[s[2], s[0]] = [s[0], s[2]];
			//rotate by:
			// [ 0 0  1 ]
			// [ 0 1  0 ]
			// [-1 0  0 ]
			//NOTE: by avoiding normalization could do this mul() much more efficiently!
			V = mul_quat(V, [0, Math.SQRT1_2, 0, Math.SQRT1_2]);
		}
		if (s[1] < s[2]) {
			[s[2], s[1]] = [s[1], s[2]];
			//rotate by:
			// [ 1 0  0 ]
			// [ 0 0 -1 ]
			// [ 0 1  0 ]
			//NOTE: by avoiding normalization could do this mul() much more efficiently!
			V = mul_quat(V, [Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
		}
		/*
		//DEBUG:
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
	let B = mul_mat3(A, quat_to_mat3(V));
	//console.log(`before:\n${B}`); //DEBUG
	function qr_cs(app, apq, aqq) {
		const den2 = aqq*aqq + apq*apq;
		if (den2 < tol2) {
			//if very small, rotate so sign of aqq is positive, ignoring off-diagonal:
			const c = (aqq >= 0 ? 1 : -1);
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
		Q = [
			c,  s, 0,
			-s, c, 0,
			0,  0, 1
		];
		B = mul_mat3(transpose_mat3(Q), mul_mat3(A, quat_to_mat3(V)));
	}
	{ //eliminate entry at c0 r2:
		const {c,s} = qr_cs(B[2*3+2], B[0*3+2], B[0*3+0]);
		Q = mul_mat3(Q, [
			c,  0, s,
			0,  1, 0,
			-s, 0, c
		]);
		B = mul_mat3(transpose_mat3(Q), mul_mat3(A, quat_to_mat3(V)));
	}
	{ //eliminate entry at c1 r2:
		const {c,s} = qr_cs(B[2*3+2], B[1*3+2], B[1*3+1]);
		Q = mul_mat3(Q, [
			1, 0, 0,
			0, c, s,
			0,-s, c
		]);
		B = mul_mat3(transpose_mat3(Q), mul_mat3(A, quat_to_mat3(V)));
	}

	const U = normalize(mat3_to_quat(Q));
	const Sigma = [B[0*3+0],0,0, 0,B[1*3+1],0, 0,0,B[2*3+2]];

	//console.log(`A:\n${A}`); //DEBUG
	//console.log(`U S Vt:\n${mul(mul(U.toMat3(), Sigma), transpose(V.toMat3()))}`); //DEBUG
	//console.log(`U:\n${U.toMat3()}\nS:\n${Sigma}\nV:\n${V.toMat3()}`); //DEBUG

	return {U, Sigma, V};
}

export function identityTransform() {
	return [
		1, 0, 0,
		0, 1, 0,
		0, 0, 1,
		0, 0, 0
	];
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
	A_mean = scale(1.0 / L, A_mean);
	B_mean = scale(1.0 / L, B_mean);

	//NOTE: for < 3 pts, could do some gentle regularization

	let S = mat3(0);
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
	const rot = mul_mat3(quat_to_mat3(V), transpose_mat3(quat_to_mat3(U)));

	//specifically bless as matrix so matFlatten doesn't complain (!!NOTE: should probably just ignore this!!)
	rot.rows = 3;
	rot.columns = 3;

	//HACK: actually ignore rotation:
	//const rot = new Mat3(1);

	const translation = sub(B_mean, mul_mat3_vec3(rot, A_mean));

	//assemble the final transformation:
	const xform = mat4x3(rot); //rotation part
	//translation part:
	xform[3*3+0] = translation[0];
	xform[3*3+1] = translation[1];
	xform[3*3+2] = translation[2];

	return xform;
}

export function xformTranslation(xform) {
	return vec3(xform[3*3+0], xform[3*3+1], xform[3*3+2]);
}

async function test_svd() {
	console.log("Testing svd function.");

	const MersenneTwister = (await import('./mersenne-twister.js')).default;

	const mt = new MersenneTwister(314159);
	const iters = 50000;

	const before = performance.now();

	let max_delta_info = null;
	let max_delta = -1.0;

	function test(mat, iter=-1) {
		const {U, Sigma:s, V} = svd(mat);

		const recon = mul_mat3(quat_to_mat3(U), mul_mat3(s, transpose_mat3(quat_to_mat3(V))));

		let delta = 0.0;
		for (let i = 0; i < mat.length; ++i) {
			delta = Math.max(delta, Math.abs(recon[i] - mat[i]));
		}

		if (delta > 1e-3) {
			console.log(`iter ${iter}: delta is ${delta}`);
		}

		if (delta > max_delta) {
			max_delta_info = {mat, U, s, V, recon};
			max_delta = delta;
		}
	}

	/* //this was especially a problem
	test(new Mat3(
		0.9, 0.0, 0.0,
		0.0, 0.0, 0.91,
		0.0, 0.05, 0.0
	));
	*/
	for (let iter = 0; iter < iters; ++iter) {

		//random matrix with entries in [-1,1]:
		const mat = mat3(0);
		for (let i = 0; i < mat.length; ++i) {
			mat[i] = mt.random() * 2 - 1;
		}

		{ //add some zeros:
			const zeros = Math.floor(mt.random() * mat.length);
			const pattern = [];
			for (let i = 0; i < zeros; ++i) {
				pattern.push(0);
			}
			while (pattern.length < mat.length) {
				pattern.push(1);
			}
			//shuffle zero pattern:
			for (let i = 0; i < pattern.length; ++i) {
				let sel = i + Math.floor(mt.random() * (pattern.length-i));
				[pattern[i], pattern[sel]] = [pattern[sel], pattern[i]];
			}
			//enforce zeros:
			for (let i = 0; i < pattern.length; ++i) {
				mat[i] *= pattern[i];
			}
		}

		test(mat,iter);
	}

	const after = performance.now();

	console.log(`Over ${iters} random [-1,1] matrices have ${max_delta} as maximum reconstruction error.`);
	//console.log(`${max_delta_info.mat}\n vs\n${max_delta_info.recon}`);
	console.log(`Took ${(after-before)/iters}ms per iteration.`);

}

if (typeof process !== 'undefined') {


	async function init() {
		const url = await import('url');
		const fs = await import('fs');
		if (process.argv[1] !== url.fileURLToPath(import.meta.url)) return;
		const ops = {
			'test-svd':test_svd
		};
		if (process.argv.length !== 3 || !(process.argv[2] in ops)) {
			console.log("Usage:\n\tnode gm.mjs <" + Object.keys(ops).join('|')+ ">");
			process.exit(1);
		}
		const op = process.argv[2];
		ops[op]();
	}
	init();
}
