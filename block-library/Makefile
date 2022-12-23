.PHONY : all

UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
	BLENDER = /Applications/Blender/blender.app/Contents/MacOS/blender
else ifeq ($(UNAME_S),Linux)
	BLENDER = ../../blender-3.3.0-linux-x64/blender
else
	BLENDER = blender
endif

EXPORT_BLOCKS=export-blocks.py

all : blocks.json

blocks.json : blocks.blend $(EXPORT_BLOCKS)
	$(BLENDER) --background --python $(EXPORT_BLOCKS) -- '$<' '$@'
