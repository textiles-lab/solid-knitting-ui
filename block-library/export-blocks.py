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

for obj in blocks.objects:
	if obj.type != 'MESH': continue
	if obj.parent != None: continue
	print(f"Doing block: {obj.name}")

	mesh = obj.data

	face_centers = []
	face_types = []
	face_normals = []

	for poly in mesh.polygons:
		face_centers.append(poly.center)
		face_normals.append(poly.normal)
		face_types.append(None)

	print(face_normals)

	for child in obj.children:
		if child.type == 'CURVES':
			print(f"TODO: add {child.name} to yarns.")
		elif child.type == 'MESH':
			#marker for side types
			print(f"TODO: mark {child.data.name} side.")
			to_parent = obj.matrix_world.inverted() @ child.matrix_world
			print(to_parent)
			at = to_parent @ Vector((0,0,0))
			print(at)
			#at = objchild.matrix_world


