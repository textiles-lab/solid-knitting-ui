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
	"-L1":"#880000",
	"+L1":"#bb0000",
	"-y1":"#882288",
	"+y1":"#bb88bb",
	"-c1":"#228888",
	"+c1":"#88bbbb",
	"x":"#444444",
}

out = []

# hacky function to order the centerpoints of faces of a centered cuboid
def cubeOrdering(x):
	if x[0] < -0.1:
		return (0, round(x[0]), x[1], x[2])
	elif x[1] < -0.1:
		return (1, round(x[1]), x[2], 10)
	elif  x[2] < -0.1:
		return (2, round(x[2]), 10, 10)
	elif x[0] > 0.1:
		return (3, round(x[0]), x[1], x[2])
	elif x[1] > 0.1:
		return (4, round(x[1]), x[2], 10)
	else:
		return (5, round(x[2]), 10, 10)

for obj in blocks.objects:
	if obj.type != 'MESH': continue
	if obj.parent != None: continue
	print(f"Doing block: {obj.name}")

	if "same" in obj.name:
		print(f"WARNING: skipping block {obj.name}, since it is an same-block, which does not affect the signature")
		continue

	mesh = obj.data

	# face_centers = [] #center position per face (used to assign connection labels to faces)
	# face_normals = [] #normal direction per face
	# face_types = [] #type as [+-][yLl][1-9] or 'x'
	# face_first = [] #first vertex of first (lowest-y) edge in port coordinate system
	# face_direction = [] #sign indicates direction of first edge in port coordinate system

	#re-order vertices for sorted constraint:
	vertex_order = sorted(range(0,len(mesh.vertices)), key=lambda i: tuple(mesh.vertices[i].co))
	vertex_to_sorted = [None] * len(mesh.vertices)

	for i in range(0, len(vertex_order)):
		assert vertex_to_sorted[vertex_order[i]] == None
		vertex_to_sorted[vertex_order[i]] = i


	faces = []

	mesh_center = Vector([0,0,0])

	for iP, poly in enumerate(mesh.polygons):
		face = dict()
		indices = []
		for vi in poly.vertices:
			indices.append(vertex_to_sorted[vi]) # TODO: what is face_first?
		# start = indices.index(min(indices))
		# indices = indices[start:] + indices[:start] # shift to start from smallest index

		face["indices"] = indices
		face["center"] = poly.center
		face["normal"] = poly.normal
		face["type"] = None
		face["first"] = None
		face["direction"] = None
		face["polygon_index"] = iP
		faces.append(face)
		mesh_center += face["center"]

	mesh_center /= len(faces)


	# sort faces by index tuple
	faces = sorted(faces, key=lambda x: cubeOrdering(x["center"]))

	# determine face types
	for child in obj.children:
		if child.type == 'MESH':
			#marker for side types
			label = child.data.name
			to_parent = obj.matrix_world.inverted() @ child.matrix_world
			#important vectors in parent-local space:
			at = to_parent @ Vector((0,0,0))
			outward = (to_parent @ Vector((0,0,1))) - at
			outward.normalize()
			up = (to_parent @ Vector((0,1,0))) - at
			up.normalize()
			right = (to_parent @ Vector((1,0,0))) - at
			right.normalize()

			dis = float('inf')
			best = None
			for iF in range(0,len(faces)):
				test = (faces[iF]["center"]-at).length
				if test < dis:
					dis = test
					best = iF
			#at = objchild.matrix_world
			if best == None:
				print(f"  WARNING: Did not find side to label! Ignoring {child.name}")
				continue
			if faces[best]["type"] != None:
				print(f"  WARNING: {child.name} labels already-labelled face {best}. Ignoring.")
				continue

			if child.data.name == 'x':
				#'x' is special "disconnected" face
				faces[best]["type"] = child.data.name
			else:
				#determine face direction + assign:
				align = outward.dot(faces[best]["normal"])
				if align > 0.9:
					faces[best]["type"] = '+' + child.data.name
				elif align < -0.9:
					faces[best]["type"] = '-' + child.data.name
				else:
					print(f"  WARNING: alignment ({align}) is not > 0.9 or < -0.9 -- not sure of face direction")

			#determine "first edge" = overall lowest edge:
			poly = mesh.polygons[faces[best]["polygon_index"]]
			first = None
			first_direction = None
			height = up.dot(at) #should be below the center of the marker, right?
			for i in range(0, len(poly.vertices)):
				a = mesh.vertices[poly.vertices[i]].co
				b = mesh.vertices[poly.vertices[(i + 1) % len(poly.vertices)]].co
				test = max(up.dot(a), up.dot(b))
				direction = right.dot(b) - right.dot(a)
				if test < height:
					height = test
					first = i
					first_direction = direction
			faces[best]["first"] = first
			faces[best]["direction"] = 1 if first_direction >= 0 else -1

	for iF in range(len(faces)):
		faces[iF]["indices"] = faces[iF]["indices"][faces[iF]["first"]:] + faces[iF]["indices"][:faces[iF]["first"]]
		# if faces[iF]["direction"] < 0:
		# 	faces[iF]["indices"] = list(reversed(faces[iF]["indices"]))

	# try to determine course direction
	left_to_right = True
	found_course_dir = False
	for face in faces:
		if face["type"] == "x":
			continue
		if face["type"][:2] == "-y": # yarn in
			if not found_course_dir:
				left_to_right = (face["center"].x < mesh_center.x)
				found_course_dir = True
			elif left_to_right != (face["center"].x < mesh_center.x): # disagreement between course faces
				found_course_dir = False
		elif face["type"][:2] == "+y": #yarn out
			if not found_course_dir:
				left_to_right = (face["center"].x > mesh_center.x)
				found_course_dir = True
			elif left_to_right != (face["center"].x > mesh_center.x): # disagreement between course faces
				found_course_dir = False

	if not found_course_dir:
		print(f"Warning: ambiguous face direction on {obj.name}")

	# extract yarns, orienting the curves in the specified direction
	yarns = []
	for child in obj.children:
		if child.type == 'CURVE':
			to_parent = obj.matrix_world.inverted() @ child.matrix_world

			MIRROR = False
			if len(child.modifiers) == 0:
				pass #nothing to do
			elif len(child.modifiers) == 1 and child.modifiers[0].type == 'MIRROR':
				print(f"  applying mirror modifier [assuming x] to {child.name}")
				MIRROR = True

			def append_yarn(cps):
				for i in range(0, len(cps)):
					cps[i] = to_parent @ cps[i]

				yarn = dict()
				yarn["cps"] = cps
				begin = None
				begin_dis = float('inf')
				end = None
				end_dis = float('inf')
				for iF in range(0, len(faces)):
					test = abs( (cps[0] - faces[iF]["center"]).dot(faces[iF]["normal"]) )
					if test < 0.01: #if in the plane...
						test = (cps[0] - faces[iF]["center"]).length #...compute distance to center
						if test < begin_dis:
							begin_dis = test
							begin = iF
					test = abs( (cps[-1] - faces[iF]["center"]).dot(faces[iF]["normal"]) )
					if test < 0.01: #if in the plane...
						test = (cps[-1] - faces[iF]["center"]).length #...compute distance to center
						if test < end_dis:
							end_dis = test
							end = iF
				yarn["begin"] = begin
				yarn["end"] = end

				# TODO: orient using other markers in blender that are currently unused
				determined_orientation = False
				# if yarn has course face, use that to orient
				if faces[begin]["type"][1] == "y" or (end is not None and faces[end]["type"][1] == "y"):
					if (faces[begin]["type"][:2] == "+y" or (end is not None and faces[end]["type"][:2] == "-y")):
						# reverse if yarn goes in an out face or out an in face
						yarn["cps"].reverse()
						yarn["begin"], yarn["end"] = yarn["end"], yarn["begin"]
					determined_orientation = True
				elif found_course_dir: # for other types of yarn, guess orientation if a block orientation is known
					if end is not None and ((faces[begin]["type"][1] == "+l" and faces[end]["type"][1] == "+l") or (faces[begin]["type"][1] == "-l" and faces[end]["type"][1] == "-l")):
						determined_orientation = False # can't orient l-l loops
					elif faces[begin]["type"][:2] == "-l": # ensure that -l yarn points in course direction
						if (left_to_right and cps[0][0] > cps[-1][0]) or ((not left_to_right) and cps[0][0] < cps[-1][0]):
							yarn["cps"].reverse()
							yarn["begin"], yarn["end"] = yarn["end"], yarn["begin"]
						determined_orientation = True
					elif end is not None and faces[end]["type"][:2] == "+l": # ensure that -l yarn points in course direction
						if (left_to_right and cps[0][0] < cps[-1][0]) or ((not left_to_right) and cps[0][0] > cps[-1][0]):
							yarn["cps"].reverse()
							yarn["begin"], yarn["end"] = yarn["end"], yarn["begin"]
						determined_orientation = True
					elif faces[begin]["type"][:2] == "+l": # ensure that +l yarns points opposite course direction
						if (left_to_right and cps[0][0] < cps[-1][0]) or ((not left_to_right) and cps[0][0] > cps[-1][0]):
							yarn["cps"].reverse()
							yarn["begin"], yarn["end"] = yarn["end"], yarn["begin"]
						determined_orientation = True
					elif end is not None and faces[end]["type"][:2] == "-l": # ensure that +l yarns points opposite course direction
						if (left_to_right and cps[0][0] > cps[-1][0]) or ((not left_to_right) and cps[0][0] < cps[-1][0]):
							yarn["cps"].reverse()
							yarn["begin"], yarn["end"] = yarn["end"], yarn["begin"]
						determined_orientation = True

				if not determined_orientation:
					print(f"failed to determine orientation on yarn {len(yarns)} of {obj.name}")
				# 	print(faces)
				# 	print(begin)
				# 	print(end)
				yarn["oriented"] = determined_orientation
				yarns.append(yarn)


			for spline in child.data.splines:
				if spline.type != 'BEZIER':
					print(f"WARNING: {child.name} has {spline.type}-type spline -- skipping")
					continue
				cps = []
				cps2 = None
				for i in range(0, len(spline.bezier_points)):
					cps.append(spline.bezier_points[i].handle_left)
					cps.append(spline.bezier_points[i].co)
					cps.append(spline.bezier_points[i].handle_right)
				cps = cps[1:-1]

				if MIRROR:
					cps2 = []
					for cp in reversed(cps):
						cps2.append(Vector((-cp.x, cp.y, cp.z)))

					#merge cps, cps2 if they meet at x=0:
					if abs(cps[0].x) < 1e-3:
						cps = cps2[:-1] + cps
						cps2 = None
					if abs(cps[-1].x) < 1e-3:
						cps = cps + cps2[1:]
						cps2 = None

				append_yarn(cps)

				if cps2 != None: append_yarn(cps2)



	

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
		out.append(f'\t\t{{ "type":"{face["type"]}", "direction":{face["direction"]}, "indices":[{",".join(map(str, face["indices"]))}], "color":"{TYPE_COLORS[face["type"]]}" }}{comma}')
		
	out.append(f'\t],')
	out.append(f'\t"yarns":[')
	for yarn in yarns:
		comma = ','
		if yarn is yarns[-1]: comma = ''
		cps = []
		for cp in yarn["cps"]:
			cps.append(f'[{cp.x:.3f},{cp.y:.3f},{cp.z:.3f}]')
		info = f'\t\t{{'
		if yarn["begin"] == None: pass
		else: info += f' "begin":{yarn["begin"]},'
		if yarn["end"] == None: pass
		else: info += f' "end":{yarn["end"]},'
		info += f' "cps":[{",".join(cps)}],'
		info += f' "oriented": {"true" if yarn["oriented"] else "false"} }}{comma}'
		out.append(info)
		#was: out.append(f'\t\t{{ "begin":{yarn["begin"]}, "end":{yarn["end"]}, "cps":[{",".join(cps)}] }}{comma}')

	out.append(f'\t],')
	out.append(f'\t"machine":{{ }},')
	out.append(f'\t"human":{{ }}')
	out.append(f'}}')

with open(outfile,'wb') as f:
	f.write(('[\n' + '\n'.join(out) + '\n]').encode('utf8'))





