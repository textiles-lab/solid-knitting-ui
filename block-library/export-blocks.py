#!/usr/bin/env python

#based on 'export-meshes.py' from 15-466f-21 base code,
#which is based on 'export-sprites.py' and 'glsprite.py' from TCHOW Rainbow; code used is released into the public domain.

#Note: Script meant to be executed within blender 3.3, as per:
#blender --background --python export-blocks.py -- blocks.blend blocks.json

import sys,re

args = []
for i in range(0,len(sys.argv)):
	if sys.argv[i] == '--':
		args = sys.argv[i+1:]

if len(args) != 2:
	print("\n\nUsage:\nblender --background --python export-blocks.py -- <infile.blend> <outfile.json>\nExports all blocks (meshes in the \"Blocks\" collection) to a block library json file.\n")
	exit(1)


import bpy
from mathutils import Vector

infile = args[0]
outfile = args[1]

bpy.ops.wm.open_mainfile(filepath=infile)

blocks = bpy.data.collections['Blocks']

TYPE_COLORS={
	"-l1":"#888811",
	"+l1":"#bbbb11",
	"-L1":"#aa0000",
	"+L1":"#bb0000",
	"-y1":"#884488",
	"+y1":"#bb88bb",
	"x":"#444444",
}

out = []

for obj in blocks.objects:
	if obj.type != 'MESH': continue
	if obj.parent != None: continue
	print(f"Doing block: {obj.name}")

	mesh = obj.data

	face_centers = []
	face_types = []
	face_normals = []
	face_types = []
	face_first = []

	for poly in mesh.polygons:
		face_centers.append(poly.center)
		face_normals.append(poly.normal)
		face_types.append(None)
		face_first.append(None)

	yarns = []

	for child in obj.children:
		if child.type == 'CURVE':
			to_parent = obj.matrix_world.inverted() @ child.matrix_world
			for spline in child.data.splines:
				if spline.type != 'BEZIER':
					print(f"WARNING: {child.name} has {spline.type}-type spline -- skipping")
					continue
				cps = []
				for i in range(0, len(spline.bezier_points)-1):
					cps.append(to_parent @ spline.bezier_points[i].handle_right)
					cps.append(to_parent @ spline.bezier_points[i].co)
					cps.append(to_parent @ spline.bezier_points[i].handle_left)
				cps = cps[1:-1]
				yarn = dict()
				yarn["cps"] = cps
				begin = None
				begin_dis = float('inf')
				end = None
				end_dis = float('inf')
				for f in range(0, len(face_centers)):
					test = abs( (cps[0] - face_centers[f]).dot(face_normals[f]) )
					if test < begin_dis:
						begin_dis = test
						begin = f
					test = abs( (cps[-1] - face_centers[f]).dot(face_normals[f]) )
					if test < end_dis:
						end_dis = test
						end = f
				yarn["begin"] = begin
				yarn["end"] = end
				yarns.append(yarn)

		elif child.type == 'MESH':
			#marker for side types
			label = child.data.name
			to_parent = obj.matrix_world.inverted() @ child.matrix_world
			#important vectors in parent-local space:
			at = to_parent @ Vector((0,0,0))
			outward = (to_parent @ Vector((0,0,1))) - at
			outward.normalize()
			up = (to_parent @ Vector((0,1,0))) - at
			up.normalize()

			dis = float('inf')
			best = None
			for f in range(0,len(face_centers)):
				test = (face_centers[f]-at).length
				if test < dis:
					dis = test
					best = f
			#at = objchild.matrix_world
			if best == None:
				print(f"  WARNING: Did not find side to label! Ignoring {child.name}")
				continue
			if face_types[best] != None:
				print(f"  WARNING: {child.name} labels already-labelled face {best}. Ignoring.")
				continue

			if child.data.name == 'x':
				#'x' is special "disconnected" face
				face_types[best] = child.data.name
			else:
				#determine face direction + assign:
				align = outward.dot(face_normals[best])
				if align > 0.9:
					face_types[best] = '+' + child.data.name
				elif align < -0.9:
					face_types[best] = '-' + child.data.name
				else:
					print(f"  WARNING: alignment ({align}) is not > 0.9 or < -0.9 -- not sure of face direction")

			#determine "first edge" = overall lowest edge:
			poly = mesh.polygons[best]
			first = None
			height = up.dot(at) #should be below the center of the marker, right?
			for i in range(0, len(poly.vertices)):
				a = mesh.vertices[poly.vertices[i]].co
				b = mesh.vertices[poly.vertices[(i + 1) % len(poly.vertices)]].co
				test = max(up.dot(a), up.dot(b))
				if test < height:
					height = test
					first = i
			face_first[best] = first

	#re-order vertices for sorted constraint:
	vertex_order = sorted(range(0,len(mesh.vertices)), key=lambda i: tuple(mesh.vertices[i].co))
	vertex_to_sorted = [None] * len(mesh.vertices)

	for i in range(0, len(vertex_order)):
		assert vertex_to_sorted[vertex_order[i]] == None
		vertex_to_sorted[vertex_order[i]] = i


	faces = []
	for f in range(0, len(mesh.polygons)):
		face = dict()
		if face_types[f] == None:
			print(f"ERROR: {obj.name} has an unlabeled face.")
			exit(1)
		face["type"] = face_types[f]
		indices = []
		for vi in mesh.polygons[f].vertices:
			indices.append(vertex_to_sorted[vi])
		assert face_first[f] != None
		indices = indices[face_first[f]:] + indices[:face_first[f]]
		face["indices"] = indices
		faces.append(face)
	faces = sorted(faces, key=lambda x: x["indices"])

	if len(out) > 0: out[-1] = out[-1] + ','

	shortname = obj.name
	try:
		shortname = shortname[:shortname.index('.')]
	except:
		pass

	out.append(f'{{')
	out.append(f'\t"name":"{shortname}", //from {obj.name}')
	out.append(f'\t"vertices":[')
	for vi in vertex_order:
		v = mesh.vertices[vi]
		comma = ','
		if vi == vertex_order[-1]: comma = ''
		out.append(f'\t\t[{v.co.x:.3f},{v.co.y:.3f},{v.co.z:.3f}]{comma}')
	out.append(f'\t],')
	out.append(f'\t"faces":[')
	for face in faces:
		comma = ','
		if face is faces[-1]: comma = ''
		out.append(f'\t\t{{ "type":"{face["type"]}", "indices":[{",".join(map(str, face["indices"]))}], "color":"{TYPE_COLORS[face["type"]]}" }}{comma}')
		
	out.append(f'\t],')
	out.append(f'\t"yarns":[')
	for yarn in yarns:
		comma = ','
		if yarn is yarns[-1]: comma = ''
		cps = []
		for cp in yarn["cps"]:
			cps.append(f'[{cp.x:.3f},{cp.y:.3f},{cp.z:.3f}]')
		out.append(f'\t\t{{ "begin":{yarn["begin"]}, "end":{yarn["end"]}, "cps":[{",".join(cps)}] }}{comma}')

	out.append(f'\t],')
	out.append(f'\t"machine":{{ }},')
	out.append(f'\t"human":{{ }}')
	out.append(f'}}')

with open(outfile,'wb') as f:
	f.write(('[\n' + '\n'.join(out) + '\n]').encode('utf8'))





