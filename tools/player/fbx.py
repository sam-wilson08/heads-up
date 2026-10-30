"""A minimal binary FBX reader: enough to pull out mesh geometry, UVs and settings."""
import struct
import zlib

ARRAY_FORMATS = {"f": "f", "d": "d", "l": "q", "i": "i", "b": "?"}


class Node:
    def __init__(self, name, props, children):
        self.name, self.props, self.children = name, props, children

    def find(self, name):
        return next((c for c in self.children if c.name == name), None)

    def find_all(self, name):
        return [c for c in self.children if c.name == name]


def parse(data):
    version = struct.unpack("<I", data[23:27])[0]
    wide = version >= 7500
    header = 25 if wide else 13

    def read(pos):
        if wide:
            end, nprops, plen = struct.unpack("<QQQ", data[pos : pos + 24])
            pos += 24
        else:
            end, nprops, plen = struct.unpack("<III", data[pos : pos + 12])
            pos += 12
        nlen = data[pos]
        pos += 1
        name = data[pos : pos + nlen].decode("latin1")
        pos += nlen
        if end == 0:
            return None, pos
        props, p = [], pos
        for _ in range(nprops):
            t = chr(data[p])
            p += 1
            if t in "SR":
                (length,) = struct.unpack("<I", data[p : p + 4])
                p += 4
                raw = data[p : p + length]
                props.append(raw.decode("latin1") if t == "S" else raw)
                p += length
            elif t in "YCIFDL":
                size, fmt = {"Y": (2, "<h"), "C": (1, "<?"), "I": (4, "<i"), "F": (4, "<f"), "D": (8, "<d"), "L": (8, "<q")}[t]
                props.append(struct.unpack(fmt, data[p : p + size])[0])
                p += size
            else:
                count, encoding, clen = struct.unpack("<III", data[p : p + 12])
                p += 12
                raw = data[p : p + clen]
                p += clen
                if encoding == 1:
                    raw = zlib.decompress(raw)
                props.append(list(struct.unpack(f"<{count}{ARRAY_FORMATS[t]}", raw)))
        children, child = [], pos + plen
        while child < end - header:
            node, child = read(child)
            if node is None:
                break
            children.append(node)
        return Node(name, props, children), end

    roots, pos = [], 27
    while pos < len(data) - 200:
        node, pos = read(pos)
        if node is None:
            break
        roots.append(node)
    return version, Node("root", [], roots)


def properties70(node):
    """A node's Properties70 block as {name: values}."""
    block = node.find("Properties70") if node else None
    return {p.props[0]: p.props[4:] for p in (block.children if block else [])}
