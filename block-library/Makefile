.PHONY : all

UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
	BLENDER = /Applications/Blender/blender.app/Contents/MacOS/blender
	ifeq ("$(wildcard $(BLENDER))", "") # if blender was not found, try another path https://stackoverflow.com/a/20566812
		BLENDER = /Applications/Blender.app/Contents/MacOS/blender
	endif
else ifeq ($(UNAME_S),Linux)
	BLENDER = ../../blender-3.3.0-linux-x64/blender
else
	BLENDER = blender
endif

EXPORT_BLOCKS=export-blocks.py
LOAD_YARNS=load-yarns-28.py

all : blocks.json

blocks.json : blocks.blend instructions.json $(EXPORT_BLOCKS)
	$(BLENDER) --background --python $(EXPORT_BLOCKS) -- '$<' '$@' instructions.json

renderfile : render-template.blend blocks.json
	$(BLENDER) --background --python $(LOAD_YARNS) -- render-template.blend blocks.json render.blend

render : render-template.blend blocks.json
	$(BLENDER) --background --python $(LOAD_YARNS) -- render-template.blend blocks.json render.blend animation-dir:library-renders