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

if len(args) not in [2, 3]:
	print("\n\nUsage:\nblender --background --python export-blocks.py -- <infile.blend> <outfile.json> [instructions.json]\nExports all blocks (meshes in the \"Blocks\" collection) to a block library json file. Optionally reads machine an human instructions for the blocks from a separate json file\n")
	exit(1)

import json

instructions = {}
if len(args) == 3:
	with open(args[2]) as f:
		strip_comment = lambda line : line if line.find("//") < 0 else line[:line.find("//")]
		uncommented_text = "".join(strip_comment(line) for line in f)
		instructions = json.loads(uncommented_text)

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

for obj in blocks.objects:
	if obj.type != 'MESH': continue
	if obj.parent != None: continue
	print(f"Doing block: {obj.name}")

	mesh = obj.data

	face_centers = [] #center position per face (used to assign connection labels to faces)
	face_normals = [] #normal direction per face
	face_types = [] #type as [+-][yLl][1-9] or 'x'
	face_first = [] #first vertex of first (lowest-y) edge in port coordinate system
	face_direction = [] #sign indicates direction of first edge in port coordinate system

	mesh_center = Vector([0,0,0])

	for poly in mesh.polygons:
		mesh_center = mesh_center + poly.center
		face_centers.append(poly.center)
		face_normals.append(poly.normal)
		face_types.append(None)
		face_first.append(None)
		face_direction.append(None)

	mesh_center /= len(face_centers)

	yarns = []

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
			face_first[best] = first
			face_direction[best] = first_direction

	left_to_right = True
	found_course_dir = False
	for iF, face_type in enumerate(face_types):
		if face_type == "x":
			continue
		if face_type[:2] == "-y": # yarn in
			if not found_course_dir:
				left_to_right = (face_centers[iF].x < mesh_center.x)
				found_course_dir = True
			elif left_to_right != (face_centers[iF].x < mesh_center.x): # disagreement between course faces
				found_course_dir = False
		elif face_type[:2] == "+y": #yarn out
			if not found_course_dir:
				left_to_right = (face_centers[iF].x > mesh_center.x)
				found_course_dir = True
			elif left_to_right != (face_centers[iF].x > mesh_center.x): # disagreement between course faces
				found_course_dir = False

	if not found_course_dir:
		print(f"Warning: ambiguous face direction on {obj.name}")

	# extract yarns, orienting the curves in the specified direction
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
				for f in range(0, len(face_centers)):
					test = abs( (cps[0] - face_centers[f]).dot(face_normals[f]) )
					if test < 0.01: #if in the plane...
						test = (cps[0] - face_centers[f]).length #...compute distance to center
						if test < begin_dis:
							begin_dis = test
							begin = f
					test = abs( (cps[-1] - face_centers[f]).dot(face_normals[f]) )
					if test < 0.01: #if in the plane...
						test = (cps[-1] - face_centers[f]).length #...compute distance to center
						if test < end_dis:
							end_dis = test
							end = f
				yarn["begin"] = begin
				yarn["end"] = end

				determined_orientation = False
				# if yarn has course face, use that to orient
				if face_types[begin][1] == "y" or (end is not None and face_types[end][1] == "y"):
					if (face_types[begin][:2] == "+y" or (end is not None and face_types[end][:2] == "-y")):
						# reverse if yarn goes in an out face or out an in face
						yarn["cps"].reverse()
						yarn["begin"], yarn["end"] = yarn["end"], yarn["begin"]
					determined_orientation = True
				# TODO: I think that some of these orientations are wrong. I'm not sure if there are valid heuristics that we can use
				# elif found_course_dir: # for other types of yarn, guess orientation if a block orientation is known
				# 	if end is not None and ((face_types[begin][1] == "+l" and face_types[end][1] == "+l") or (face_types[begin][1] == "-l" and face_types[end][1] == "-l")):
				# 		determined_orientation = False # can't orient l-l loops
				# 	elif face_types[begin][:2] == "-l": # ensure that -l yarn points in course direction
				# 		if (left_to_right and cps[0][0] > cps[-1][0]) or ((not left_to_right) and cps[0][0] < cps[-1][0]):
				# 			yarn["cps"].reverse()
				# 			yarn["begin"], yarn["end"] = yarn["end"], yarn["begin"]
				# 		determined_orientation = True
				# 	elif end is not None and face_types[end][:2] == "+l": # ensure that -l yarn points in course direction
				# 		if (left_to_right and cps[0][0] < cps[-1][0]) or ((not left_to_right) and cps[0][0] > cps[-1][0]):
				# 			yarn["cps"].reverse()
				# 			yarn["begin"], yarn["end"] = yarn["end"], yarn["begin"]
				# 		determined_orientation = True
				# 	elif face_types[begin][:2] == "+l": # ensure that +l yarns points opposite course direction
				# 		if (left_to_right and cps[0][0] < cps[-1][0]) or ((not left_to_right) and cps[0][0] > cps[-1][0]):
				# 			yarn["cps"].reverse()
				# 			yarn["begin"], yarn["end"] = yarn["end"], yarn["begin"]
				# 		determined_orientation = True
				# 	elif end is not None and face_types[end][:2] == "-l": # ensure that +l yarns points opposite course direction
				# 		if (left_to_right and cps[0][0] > cps[-1][0]) or ((not left_to_right) and cps[0][0] < cps[-1][0]):
				# 			yarn["cps"].reverse()
				# 			yarn["begin"], yarn["end"] = yarn["end"], yarn["begin"]
				# 		determined_orientation = True

				if not determined_orientation:
					print(f"failed to determine orientation on yarn {len(yarns)} of {obj.name}")
				# 	print(face_types)
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
		assert face_direction[f] != None
		indices = indices[face_first[f]:] + indices[:face_first[f]]
		#if face_direction[f] < 0:
		#	indices = list(reversed(indices))
		face["indices"] = indices
		if face_direction[f] >= 0:
			face["direction"] = 1
		else:
			face["direction"] = -1
		faces.append(face)
	face_order = sorted(range(0, len(faces)), key=lambda i: faces[i]["indices"])
	face_to_sorted = [None] * len(faces)

	for i in range(0, len(face_order)):
		assert face_to_sorted[face_order[i]] == None
		face_to_sorted[face_order[i]] = i
	# faces = sorted(faces, key=lambda x: x["indices"])

	if len(out) > 0: out[-1] = out[-1] + ','

	shortname = obj.name
	try:
		shortname = shortname[:shortname.index('.')]
	except:
		pass

	out.append(f'{{')
	out.append(f'\t"name":"{shortname}", //from {obj.name}')
	out.append(f'\t"longname": "{obj.name}",')
	out.append(f'\t"vertices":[')
	for vi in vertex_order:
		v = mesh.vertices[vi]
		comma = ','
		if vi == vertex_order[-1]: comma = ''
		out.append(f'\t\t[{v.co.x:.8f},{v.co.y:.8f},{v.co.z:.8f}]{comma}')
	out.append(f'\t],')
	out.append(f'\t"faces":[')
	for i in face_order:
		face = faces[i]
		comma = ','
		if i is face_order[-1]: comma = ''
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
		else: info += f' "begin":{face_to_sorted[yarn["begin"]]},'
		if yarn["end"] == None: pass
		else: info += f' "end":{face_to_sorted[yarn["end"]]},'
		info += f' "cps":[{",".join(cps)}],'
		info += f' "oriented": {"true" if yarn["oriented"] else "false"} }}{comma}'
		out.append(info)
		#was: out.append(f'\t\t{{ "begin":{yarn["begin"]}, "end":{yarn["end"]}, "cps":[{",".join(cps)}] }}{comma}')
	out.append(f'\t],')

	machine_instructions = ""
	human_instructions = {}
	if obj.name in instructions:
		if "machine" in instructions[obj.name]:
			machine_instructions = instructions[obj.name]["machine"]
		if "human" in instructions[obj.name] and instructions[obj.name]["human"]:
			human_instructions = instructions[obj.name]["human"]
	out.append(f'\t"machine":{json.dumps(machine_instructions)},')
	out.append(f'\t"human":{json.dumps(human_instructions)}')
	out.append(f'}}')

with open(outfile,'wb') as f:
	f.write(('[\n' + '\n'.join(out) + '\n]').encode('utf8'))





