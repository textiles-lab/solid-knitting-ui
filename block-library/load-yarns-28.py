#!/usr/bin/env python

# based on load-yarns-28.py in knit.work/yarns-3d, which is based on export-scene.py in kit

#Note: Script meant to be executed from within blender, as per:
#blender --python load-yarns.py -- <template.blend> <blocks.json> [--out out.png]

import sys,re,os
import json

args = []
for i in range(0,len(sys.argv)):
	if sys.argv[i] == '--':
		args = sys.argv[i+1:]

if len(args) < 2 or len(args) > 5:
	print("\n\nUsage:\nblender --python load-yarns.py -- <template.blend> <blocks.json> [save.blend] [animation-dir:dir] [camera-margin:1.0,1.0] [scale-radius:0.8]\nLoad the yarns into clones of the 'Yarn' bezier curve object in the template blend file. If smobj is specified, also creates edge/vertex/face geometry. \n")
	exit(1)

CAMERA_MARGIN = (1.0, 1.0)
SCALE_RADIUS = 1.0

template_file = args[0]
block_file = args[1]
animation_dir = None
smobj_file = None
save_file = None
for arg in args[2:]:
	if arg.endswith(".blend"):
		assert(save_file == None)
		dirname = os.path.dirname(__file__)
		save_file = os.path.join(dirname, arg)
	elif arg.startswith("animation-dir:"):
		assert(animation_dir == None)
		animation_dir = os.path.expanduser(arg[len("animation-dir:"):]) # expand special path stuff (e.g. ~ from https://stackoverflow.com/a/2057072)
	elif arg.startswith("camera-margin:"):
		[x,y] = arg[14:].split(',')
		CAMERA_MARGIN = (float(x), float(y))
	elif arg.startswith("scale-radius:"):
		SCALE_RADIUS = float(arg[13:])
	else:
		print("Expecting extra file '" + args[i] + "' to end in .png or .smobj")
		exit(1)

print("Reading from '" + block_file + "' into template '" + template_file +"'")
library = {}
if block_file:
	with open(block_file) as f:
		strip_comment = lambda line : line if line.find("//") < 0 else (line[:line.find("//")] + "\n")
		uncommented_lines = [strip_comment(line) for line in f]
		uncommented_text = "".join(uncommented_lines)
		print(uncommented_text)
		library = json.loads(uncommented_text)


if animation_dir:
	print("  + rendering to '" + animation_dir + "'")

print("  + camera margin " + str(CAMERA_MARGIN))

import bpy, bmesh
import struct
import math
import time
from mathutils import Vector, Matrix

from itertools import accumulate # compute prefix sums

bpy.ops.wm.open_mainfile(filepath=template_file)

materials = []

face_material = None

esample_faces = dict()
example_edges = dict()
example_markers = dict()

example_vertex = None
example_block = None
example_arrow = None

ground_plane = None

def hide(obj):
	obj.hide_viewport = True #blender 2.8
	obj.hide_select = True
	obj.hide_render = True
def show(obj):
	obj.hide_viewport = False #blender 2.8
	obj.hide_select = False
	obj.hide_render = False

for obj in bpy.data.objects:
	if obj.name.startswith("ExampleYarn"):
		hide(obj)
		materials = obj.data.materials
	elif obj.name.startswith("ExampleFace"):
		hide(obj)
		face_material = obj.active_material
	elif obj.name.startswith("ExampleEdge"):
		hide(obj)
		example_edges[obj.name[11:]] = obj
	elif obj.name.startswith("ExampleMarker"):
		hide(obj)
		example_markers[obj.name[13:]] = obj
	elif obj.name.startswith("ExampleVertex"):
		hide(obj)
		example_vertex = obj
	elif obj.name.startswith("ExampleBlock"):
		hide(obj)
		example_block = obj
	elif obj.name.startswith("ExampleArrow"):
		hide(obj)
		example_arrow = obj
	elif obj.name.startswith("ExampleText"):
		hide(obj)
		example_text = obj
	elif obj.name.startswith("Ground"):
		ground_plane = obj
	elif obj.name.startswith("temp"):
		hide(obj)

def flatten(nested_list):
	return sum(nested_list, [])

def do_yarn(pts, radius, color_id = 0):
	print("Yarn with " + str(len(pts)) + " points of radius " + str(radius))

	curve = bpy.data.curves.new("Yarn", 'CURVE')
	obj = bpy.data.objects.new(curve.name, curve)
	bpy.context.collection.objects.link(obj)
	if len(materials) and color_id < len(materials):
		obj.active_material = materials[color_id]
	curve.dimensions = '3D'
	curve.resolution_u = 10
	curve.use_fill_caps = True
	spline = curve.splines.new('BEZIER')
	bp = spline.bezier_points
	#spline.type = 'NURBS' #faster -- by a lot! but hmm, doesn't really
	#bp = spline.points

	#okay, want to do splines at each midpoint with handles at each segment
	# ... well, want quadratic curves like this ...

	# points in middle of curve have 2 handles, the 2 endpoints have 1 handle. So len(pts) = 3(n-2) + 4 = 3n-2. So n = (len + 2) / 3
	bp.add((len(pts)+2)//3 - 1) # bp starts with 1 point already

	#NOTE: handles are by-default free so don't bother setting them:

	#print("Handles -> FREE...")
#	time_range = time.perf_counter()
#	for i in range(0, len(pts)-1):
#		if i % 1000 == 0: print(i)
#		bp[i].handle_left_type = 'FREE'
#		bp[i].handle_right_type = 'FREE'
#	time_range = time.perf_counter() - time_range

#	print("Time items: " + str(time_items) + " vs range: " + str(time_range))

	print("Set position...")

	handle_left = []
	handle_right = []
	co = []

	#first point: (offet slightly to fix collision with outer box)
	a = pts[0]
	b = pts[1]
	co += [0.99 * a[i] + 0.01 * b[i] for i in range(3)]
	handle_left += b

	handle_right += b

	for i in range(2, len(pts)-2, 3):
		a = pts[i]
		b = pts[i+1]
		c = pts[i+2]

		co += b
		handle_left += a
		handle_right += c
	
	#last point:
	a = pts[-2]
	b = pts[-1]

	co += [0.99 * b[i] + 0.01 * a[i] for i in range(3)]
	handle_left += a
	handle_right += a

	bp.foreach_set('co', co)
	bp.foreach_set('handle_left', handle_left)
	bp.foreach_set('handle_right', handle_right)

	#------------------

	#NOTE: handles are by-default free so don't bother setting them:
#	print("Handles -> ALIGNED...")
#	for [i,v] in bp.items(): #range(0, len(pts)-1):
#		if i % 1000 == 0: print(i)
#		v.handle_left_type = 'ALIGNED'
#		v.handle_right_type = 'ALIGNED'

	#set bevel:
	curve.bevel_mode = 'ROUND'
	curve.bevel_depth = radius * SCALE_RADIUS

	# subdivision
	modifier = obj.modifiers.new(name='Subdivision Surface', type='SUBSURF')

	return obj

#bounding box might be updated by smobj or yarns:
box_min = (float('inf'), float('inf'), float('inf'))
box_max = (float('-inf'), float('-inf'), float('-inf'))

def do_block(block_info):
	global box_min, box_max # allow fn to change box_min, box_max

	vertices = block_info["vertices"]
	faces = block_info["faces"]

	#=== find bounding box
	local_box_min = (float('inf'), float('inf'), float('inf'))
	local_box_max = (float('-inf'), float('-inf'), float('-inf'))
	for pt in vertices:
		local_box_min = ( min(local_box_min[0], pt[0]), min(local_box_min[1], pt[1]), min(local_box_min[2], pt[2]) )
		local_box_max = ( max(local_box_max[0], pt[0]), max(local_box_max[1], pt[1]), max(local_box_max[2], pt[2]) )

	box_min = ( min(local_box_min[0], box_min[0]), min(local_box_min[1], box_min[1]), min(local_box_min[2], box_min[2]) )
	box_max = ( max(local_box_max[0], box_max[0]), max(local_box_max[1], box_max[1]), max(local_box_max[2], box_max[2]) )


	# create object and fix visibility
	obj = example_block.copy()
	obj.data = example_block.data.copy() # copy so we can edit without changing example
	bpy.context.scene.collection.objects.link(obj)
	show(obj)
	obj.name = block_info["longname"]

	# set up vertices	
	if len(obj.data.vertices) < len(vertices):
		obj.data.vertices.add(len(vertices) - len(obj.data.vertices))
	elif len(obj.data.vertices) > len(vertices):
		print(f"error: TemplateBlock has too many vertices for {block_info['longname']}")
		print(len(obj.data.vertices))
		print(len(vertices))
		print(vertices)
	obj.data.vertices.foreach_set("co", flatten(vertices))

	# set up faces
	# with reference to: https://devtalk.blender.org/t/alternative-in-2-80-to-create-meshes-from-python-using-the-tessfaces-api/7445/3
	loop_vertex_indices = flatten(f["indices"] for f in faces)
	mesh_loop_total = [len(f["indices"]) for f in faces]
	mesh_loop_start = [0] + list(accumulate(mesh_loop_total))[:-1] # start prefix sums from 0

	if len(obj.data.polygons) < len(mesh_loop_start):
		obj.data.polygons.add(len(mesh_loop_start) - len(obj.data.polygons))
	elif len(obj.data.polygons) > len(mesh_loop_start):
		print("error: TemplateBlock has too many polygons")
	if len(obj.data.loops) < len(loop_vertex_indices):
		obj.data.loops.add(len(loop_vertex_indices) - len(obj.data.loops))
	elif len(obj.data.loops) > len(loop_vertex_indices):
		print("error: TemplateBlock has too many loops")

	obj.data.loops.foreach_set("vertex_index", loop_vertex_indices)
	obj.data.polygons.foreach_set("loop_start", mesh_loop_start)
	obj.data.polygons.foreach_set("loop_total", mesh_loop_total)

	obj.data.update()
	obj.data.validate()

	# remove extraneous edges https://devtalk.blender.org/t/how-to-bmesh-select-vertex-group-and-delete-only-edges/11444/2
	bpy.context.view_layer.objects.active = obj
	bpy.ops.object.mode_set(mode='EDIT')
	bm = bmesh.from_edit_mesh(obj.data)
	def minmax(a,b):
		return (a, b) if a < b else (b, a)

	true_edges = set()
	for f in faces:
		for i in range(len(f["indices"])):
			true_edges.add(minmax(f["indices"][i], (f["indices"][(i + 1) % len(f["indices"])])))

	bad_edges = []
	for e in bm.edges:
		v0, v1 = e.verts
		if minmax(v0.index, v1.index) not in true_edges:
			bad_edges.append(e)
	bmesh.ops.delete(bm, geom=bad_edges, context='EDGES')
	bmesh.update_edit_mesh(obj.data, destructive=True)
	bpy.ops.object.mode_set(mode='OBJECT')

	# draw arrows and text on faces
	for face in faces:
		if len(face["type"]) < 3:
			# TODO: still draw letters on X faces
			continue # no arrows for weird faces
		normal = Vector((0,0,0))
		face_min = (float('inf'), float('inf'), float('inf')) # HACK: use face bounding box to place arrow
		face_max = (float('-inf'), float('-inf'), float('-inf'))
		for i in range(1, len(face["indices"])):
			a = Vector(vertices[face["indices"][0]])
			b = Vector(vertices[face["indices"][(i)%len(face["indices"])]])
			c = Vector(vertices[face["indices"][(i+1)%len(face["indices"])]])
			normal += (b-a).cross(c-a)

			face_min = ( min(face_min[0], b[0]), min(face_min[1], b[1]), min(face_min[2], b[2]) )
			face_max = ( max(face_max[0], b[0]), max(face_max[1], b[1]), max(face_max[2], b[2]) )
		normal.normalize()
		a = Vector(vertices[face["indices"][i]])
		b = Vector(vertices[face["indices"][(i+1)%len(face["indices"])]])
		along = (b-a).normalized()
		out = normal.cross(along).normalized()
		rot = Matrix.Identity(3)
		rot[0] = out
		rot[1] = -along
		rot[2] = normal
		rot.transpose()
		rot = rot.to_quaternion()

		arrow_obj = example_arrow.copy()
		bpy.context.scene.collection.objects.link(arrow_obj)
		show(arrow_obj)
		arrow_obj.rotation_mode = 'QUATERNION'
		arrow_obj.rotation_quaternion = rot #Vector((1.0, 0.0, 0.0)).rotation_difference(b-a)
		arrow_obj.location = Vector([0.5 * (face_min[i] + face_max[i]) for i in range(3)]) + 0.001 * normal;
		arrow_obj.parent = obj

		text_obj = example_text.copy()
		text_obj.data = example_text.data.copy()
		bpy.context.scene.collection.objects.link(text_obj)
		show(text_obj)
		text_obj.rotation_mode = 'QUATERNION'
		text_obj.rotation_quaternion = rot #Vector((1.0, 0.0, 0.0)).rotation_difference(b-a)
		text_obj.location = b
		text_obj.location += 0.001 * normal + 0.05 * out - 0.05 * along;
		text_obj.parent = obj
		text_obj.data.body = face["type"][:2]
		text_obj.data.align_x = 'LEFT'
		text_obj.data.align_y = 'BOTTOM'
		text_obj.active_material = bpy.data.materials[face["type"][:2]] if face["type"][:2] in bpy.data.materials else bpy.data.materials["x"]

	return obj, local_box_min, local_box_max

def yarn_color(yarn, block_info):
	begin_type = block_info["faces"][yarn["begin"]]["type"] if "begin" in yarn else ""
	end_type = block_info["faces"][yarn["end"]]["type"] if "end" in yarn else ""
	if len(begin_type) > 1 and begin_type[:2] == "-L" and len(end_type) > 1 and end_type[:2] == "-L":
		return 1
	elif (len(begin_type) > 1 and begin_type[1] == "L") or (len(end_type) > 1 and end_type[1] == "L"):
		return 2
	else:
		return 0

yarn_objects = []
block_objects = []

dx = 8
block_mins = []
block_maxes = []
for i, block_info in enumerate(library):
	block_obj, bmin, bmax = do_block(block_info)
	block_mins.append(bmin)
	block_maxes.append(bmax)
	for yarn in block_info["yarns"]:
		pts = yarn["cps"]
		radius = 0.1
		color_id = yarn_color(yarn, block_info)
		yarn_objects.append(
			do_yarn(pts, radius, color_id)
		)
		yarn_objects[-1].parent = block_obj
	block_obj.location[0] += i * dx
	block_obj.location[2] = -bmin[2] + 0.01
	block_objects.append(block_obj)

#compute bounding box of all yarns:

#apparently, evaluating depsgraph needed for bounding boxes to exist properly:
dg = bpy.context.evaluated_depsgraph_get()


# for obj in yarn_objects:
# 	for bpt in obj.bound_box:
# 		pt = obj.matrix_world @ Vector(bpt)
# 		box_min = ( min(box_min[0], pt[0]), min(box_min[1], pt[1]), min(box_min[2], pt[2]) )
# 		box_max = ( max(box_max[0], pt[0]), max(box_max[1], pt[1]), max(box_max[2], pt[2]) )

print("Bounds: " + str(box_min) + " to " + str(box_max))


#set background and camera based on bounding box:

# BG_MARGIN = 5.0

# #expand "Background" object (assuming 2x2 square centered at 0,0,0):
# bg = bpy.data.objects['Background']
# bg.location = (
# 	0.5 * (box_min[0] + box_max[0]),
# 	0.5 * (box_min[1] + box_max[1]),
# 	box_min[2] - 0.1
# )
# #s = 0.5 * max(box_max[0] - box_min[0] + 2.0 * BG_MARGIN, box_max[1] - box_min[1] + 2.0 * BG_MARGIN)
# #bg.scale = ( s, s, 1.0)
# bg.scale = (
# 	0.5 * (box_max[0] - box_min[0] + 2.0 * BG_MARGIN),
# 	0.5 * (box_max[1] - box_min[1] + 2.0 * BG_MARGIN),
# 	1.0
# 	)

camera = bpy.data.objects['Camera']
camera_origin = camera.location.copy()
camera.data.sensor_fit = 'VERTICAL'
camera.data.ortho_scale = box_max[1] - box_min[1] + 2.0 * CAMERA_MARGIN[1]
aspect = (box_max[0] - box_min[0] + 2.0 * CAMERA_MARGIN[0]) / (box_max[1] - box_min[1] + 2.0 * CAMERA_MARGIN[1])
bpy.context.scene.render.resolution_x = math.ceil(bpy.context.scene.render.resolution_y * aspect)

# animate blocks
ground_plane.location[2] = 0
for i, block_info in enumerate(library):
	camera.location = camera_origin + Vector([
		0.5 * (block_mins[i][0] + block_maxes[i][0]),
		0.5 * (block_mins[i][1] + block_maxes[i][1]),
		0.5 * (block_mins[i][2] + block_maxes[i][2]) - block_mins[i][2] + 0.01
	])
	camera.keyframe_insert(data_path="location", frame=(i+1))
	for obj in block_objects:
		obj.keyframe_insert(data_path="location", frame=(i+1))
		obj.location[0] -= dx

bpy.data.scenes["Scene"].frame_end = len(library)

#template = bpy.data.objects['Yarn']

if save_file:
	bpy.ops.wm.save_as_mainfile(filepath=save_file)

if animation_dir:
	print("Rendering...")
	bpy.context.scene.render.image_settings.file_format = 'PNG'
	for i, block_info in enumerate(library):
		outpath = os.path.join(animation_dir, block_info["longname"])
		print(f"\t{i}:\t{block_info['longname']} -> {outpath}")
		bpy.context.scene.frame_set(i+1) # 1-indexed frames

		bpy.context.scene.render.filepath = outpath
		bpy.ops.render.render(write_still=True) # render still
	print("...done!")
	exit(0)
