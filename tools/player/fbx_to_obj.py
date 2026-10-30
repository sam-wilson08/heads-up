"""Converts a Meshy FBX (one mesh, no rig) to an upright OBJ + MTL + texture, zipped for Mixamo.

Mixamo can reject Meshy's FBX ("unable to map your existing skeleton") although it has no skeleton;
an OBJ can't carry one, so it rigs cleanly.

usage: python3 tools/player/fbx_to_obj.py <meshy.fbx> <meshy base colour png> <out.zip>
"""
import math
import os
import sys
import tempfile
import zipfile

from fbx import parse, properties70

source, texture, archive = sys.argv[1:4]
out = tempfile.mkdtemp()
_, root = parse(open(source, "rb").read())
objects = root.find("Objects")
model = properties70(objects.find("Model"))
geometry = objects.find("Geometry")

# Apply the model's own rotation (Meshy stores it lying down, then turns it -90 about X) so the OBJ
# stands upright with Y up, and keep FBX's centimetre scale, which Mixamo expects.
rx, ry, rz = (math.radians(a) for a in model.get("Lcl Rotation", [0, 0, 0]))
sx, sy, sz = model.get("Lcl Scaling", [1, 1, 1])
if ry or rz:
    sys.exit("only a rotation about X is handled")
c, s = math.cos(rx), math.sin(rx)


def transform(x, y, z, scale=True):
    if scale:
        x, y, z = x * sx, y * sy, z * sz
    return x, y * c - z * s, y * s + z * c


verts = geometry.find("Vertices").props[0]
polys = geometry.find("PolygonVertexIndex").props[0]
uv_layer = geometry.find("LayerElementUV")
uvs, uv_index = uv_layer.find("UV").props[0], uv_layer.find("UVIndex").props[0]
normal_layer = geometry.find("LayerElementNormal")
normals, normal_index = normal_layer.find("Normals").props[0], normal_layer.find("NormalsIndex").props[0]

name = "player"
with open(os.path.join(out, f"{name}.obj"), "w") as f:
    f.write(f"# Converted from {os.path.basename(source)}\nmtllib {name}.mtl\no {name}\n")
    for i in range(0, len(verts), 3):
        f.write("v %.5f %.5f %.5f\n" % transform(*verts[i : i + 3]))
    for i in range(0, len(uvs), 2):
        f.write("vt %.6f %.6f\n" % (uvs[i], uvs[i + 1]))
    for i in range(0, len(normals), 3):
        f.write("vn %.5f %.5f %.5f\n" % transform(*normals[i : i + 3], scale=False))
    f.write(f"usemtl {name}\ns 1\n")
    face = []
    for corner, index in enumerate(polys):
        last = index < 0
        vertex = ~index if last else index
        face.append(f"{vertex + 1}/{uv_index[corner] + 1}/{normal_index[corner] + 1}")
        if last:
            f.write("f " + " ".join(face) + "\n")
            face = []

with open(os.path.join(out, f"{name}.mtl"), "w") as f:
    f.write(f"newmtl {name}\nKd 1.000 1.000 1.000\nKa 0 0 0\nKs 0 0 0\nmap_Kd {name}_basecolor.png\n")
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    z.write(os.path.join(out, f"{name}.obj"), f"{name}.obj")
    z.write(os.path.join(out, f"{name}.mtl"), f"{name}.mtl")
    z.write(texture, f"{name}_basecolor.png")
print("wrote", archive)
