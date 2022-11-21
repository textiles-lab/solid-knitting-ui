# Solid Knitting UI
Build patterns for solid knitting with interactive preview.

Must be accessed via a web server so it can `fetch()` data files. To do this locally you can use python's built-in web server:
```
$ python3 -m http.server 8080
$ firefox http://localhost:8080/index.html
```

Based, loosely, on https://github.com/textiles-lab/smobj/tree/master/web which is, in turn, based on the MDN WebGL tutorials.

### Currently, we have:
- Data formats with linked cubes
- Basic (position) relaxation
- Camera movement
- Helpers for webgl
- Block/face selection raycasts.
- Code to delete blocks. 
- Code to add/detach blocks. 

### TODO:
- Block library display.
- Fancy (rotation) relaxation.
- Yarn drawing.
- (Low priority) Actually write decent vector math library instead of this ad-hoc thing.
