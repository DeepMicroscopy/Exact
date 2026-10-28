import django.db.models.deletion
from django.db import migrations, models

# Processing plugins can be registration algorithms: a plugin has a type and a schema of its parameters, and a job can name a
# second image (the target of the registration), carry its parameter values and point to the registration it produced.
#
# The Rust port of the server (exact-rust) adds the same columns with the same DDL (crates/exact-db/migrations/
# 0007_registration_plugins.sql). Whichever side runs first adds them, the other is a no-op: every statement is IF NOT EXISTS
# and the model state is added independently of the database operation.
ADD_COLUMNS = """
ALTER TABLE processing_plugin ADD COLUMN IF NOT EXISTS plugin_type smallint NOT NULL DEFAULT 1;
ALTER TABLE processing_plugin ADD COLUMN IF NOT EXISTS parameters_schema jsonb;
ALTER TABLE processing_pluginjob ADD COLUMN IF NOT EXISTS target_image_id bigint
    REFERENCES images_image(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE processing_pluginjob ADD COLUMN IF NOT EXISTS parameters jsonb;
ALTER TABLE processing_pluginjob ADD COLUMN IF NOT EXISTS registration_id bigint
    REFERENCES images_imageregistration(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX IF NOT EXISTS processing_pluginjob_target_image_id ON processing_pluginjob (target_image_id);
CREATE INDEX IF NOT EXISTS processing_pluginjob_registration_id ON processing_pluginjob (registration_id);
"""

REVERSE = """
DROP INDEX IF EXISTS processing_pluginjob_registration_id;
DROP INDEX IF EXISTS processing_pluginjob_target_image_id;
ALTER TABLE processing_pluginjob DROP COLUMN IF EXISTS registration_id;
ALTER TABLE processing_pluginjob DROP COLUMN IF EXISTS parameters;
ALTER TABLE processing_pluginjob DROP COLUMN IF EXISTS target_image_id;
ALTER TABLE processing_plugin DROP COLUMN IF EXISTS parameters_schema;
ALTER TABLE processing_plugin DROP COLUMN IF EXISTS plugin_type;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('images', '0041_pyramidregistration'),
        ('processing', '0014_alter_pluginresultbitmap_location_rect'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(ADD_COLUMNS, reverse_sql=REVERSE),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='plugin',
                    name='plugin_type',
                    field=models.SmallIntegerField(choices=[(1, 'Image analysis'), (2, 'Registration')], default=1),
                ),
                migrations.AddField(
                    model_name='plugin',
                    name='parameters_schema',
                    field=models.JSONField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='pluginjob',
                    name='target_image',
                    field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                            related_name='pluginJobsAsTarget', to='images.image'),
                ),
                migrations.AddField(
                    model_name='pluginjob',
                    name='parameters',
                    field=models.JSONField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='pluginjob',
                    name='registration',
                    field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                            related_name='pluginJobs', to='images.imageregistration'),
                ),
            ],
        ),
    ]
