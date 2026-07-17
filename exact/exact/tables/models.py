import csv
import difflib
import io
import json
import zlib

from django.conf import settings
from django.db import models


# ---------------------------------------------------------------------------
# Compression helpers
# ---------------------------------------------------------------------------

def _compress(text: str) -> bytes:
    return zlib.compress(text.encode('utf-8'), level=6)


def _decompress(blob) -> str:
    return zlib.decompress(bytes(blob)).decode('utf-8')


# ---------------------------------------------------------------------------
# Diff helpers  (patch direction: new → old, so we can walk backwards)
# ---------------------------------------------------------------------------

def _make_patch(new_lines: list[str], old_lines: list[str]) -> bytes:
    """Return compressed JSON that transforms new_lines → old_lines."""
    sm = difflib.SequenceMatcher(None, new_lines, old_lines, autojunk=False)
    ops = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag != 'equal':
            ops.append({'t': tag, 'i1': i1, 'i2': i2, 'r': old_lines[j1:j2]})
    return _compress(json.dumps(ops, ensure_ascii=False))


def _apply_patch(source_lines: list[str], blob) -> list[str]:
    """Apply a compressed patch to source_lines, returning the old version."""
    ops = json.loads(_decompress(blob))
    result: list[str] = []
    src_pos = 0
    for op in ops:
        i1, i2 = op['i1'], op['i2']
        result.extend(source_lines[src_pos:i1])
        result.extend(op['r'])
        src_pos = i2
    result.extend(source_lines[src_pos:])
    return result


# ---------------------------------------------------------------------------
# CSV helpers
# ---------------------------------------------------------------------------

def _csv_dimensions(csv_text: str) -> tuple[int, int]:
    """Return (row_count, col_count) excluding header."""
    lines = [l for l in csv_text.splitlines() if l.strip()]
    if not lines:
        return 0, 0
    reader = csv.reader(lines)
    rows = list(reader)
    row_count = max(0, len(rows) - 1)
    col_count = max((len(r) for r in rows), default=0)
    return row_count, col_count


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class TableDataset(models.Model):
    image_set = models.ForeignKey(
        'images.ImageSet', on_delete=models.CASCADE, related_name='tables')
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    creator = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='created_tables')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    # ------------------------------------------------------------------
    # Version helpers
    # ------------------------------------------------------------------

    def current_version(self) -> 'TableVersion | None':
        return self.versions.filter(is_current=True).first()

    def get_current_csv(self) -> str:
        v = self.current_version()
        return _decompress(v.data) if (v and v.data) else ''

    def save_new_version(self, csv_text: str, user=None, comment: str = '') -> 'TableVersion':
        """
        Persist csv_text as a new current version.

        The previous current version loses its full data blob and instead
        receives a compressed diff (patch) that allows reconstruction of that
        version from the new current content.  All earlier versions already
        hold their own patches and are untouched.
        """
        new_lines = csv_text.splitlines(keepends=True)
        row_count, col_count = _csv_dimensions(csv_text)

        current = self.current_version()
        if current is not None:
            old_lines = _decompress(current.data).splitlines(keepends=True)
            patch_bytes = _make_patch(new_lines, old_lines)
            current.data = None
            current.patch = patch_bytes
            current.is_current = False
            current.save(update_fields=['data', 'patch', 'is_current'])
            next_num = current.version_number + 1
        else:
            next_num = 1

        return TableVersion.objects.create(
            dataset=self,
            version_number=next_num,
            created_by=user,
            comment=comment,
            data=_compress(csv_text),
            patch=None,
            row_count=row_count,
            col_count=col_count,
            is_current=True,
        )

    def get_version_csv(self, version_number: int) -> str:
        """
        Reconstruct and return the CSV text for any historical version.

        Strategy: start from the current full blob and walk backwards
        through the patch chain, applying one patch per step.
        """
        current = self.current_version()
        if current is None:
            return ''
        if current.version_number == version_number:
            return _decompress(current.data)

        if version_number < 1 or version_number >= current.version_number:
            raise ValueError(f'Invalid version number: {version_number}')

        content_lines = _decompress(current.data).splitlines(keepends=True)

        # Patches for versions (current-1) down to version_number, newest first.
        # Each version N holds the patch that transforms (N+1) → N.
        patches = list(
            self.versions.filter(
                is_current=False,
                version_number__gte=version_number,
                version_number__lt=current.version_number,
            ).order_by('-version_number')
        )

        for v in patches:
            content_lines = _apply_patch(content_lines, v.patch)
            if v.version_number == version_number:
                break

        return ''.join(content_lines)


class TableVersion(models.Model):
    dataset = models.ForeignKey(
        TableDataset, on_delete=models.CASCADE, related_name='versions')
    version_number = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='table_versions')
    comment = models.CharField(max_length=500, blank=True)
    # Full compressed CSV — populated only for the current version.
    data = models.BinaryField(null=True, blank=True)
    # Compressed JSON diff (new→old) — populated only for historical versions.
    patch = models.BinaryField(null=True, blank=True)
    row_count = models.IntegerField(default=0)
    col_count = models.IntegerField(default=0)
    is_current = models.BooleanField(default=False, db_index=True)

    class Meta:
        unique_together = ('dataset', 'version_number')
        ordering = ['-version_number']

    def __str__(self):
        return f'v{self.version_number} of {self.dataset_id}'


class TableViewSettings(models.Model):
    """Per-user display preferences — column widths, hidden cols/rows, etc."""
    dataset = models.ForeignKey(
        TableDataset, on_delete=models.CASCADE, related_name='view_settings')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='table_view_settings')
    # {col_widths: {idx: px}, hidden_cols: [idx,...], hidden_rows: [idx,...],
    #  frozen_cols: N, sort: {col: idx, dir: 'asc'|'desc'}}
    settings_json = models.JSONField(default=dict)

    class Meta:
        unique_together = ('dataset', 'user')
