import django.db.models.deletion
from django.db import migrations, models

# Processing plugins can be registration algorithms: a plugin has a type and a schema of its parameters, and a job can name a
# second image (the target of the registration) and carry its parameter values. The outcome of a registration is an
# ImageRegistration (created, or overwritten if the pair already has one); the job does not store it.
#
# The Rust port of the server (exact-rust) adds the same columns with the same DDL (crates/exact-db/migrations/
# 0007_registration_plugins.sql). Whichever side runs first adds them, the other is a no-op: every statement is IF NOT EXISTS
# and the model state is added independently of the database operation.
PARAMETERS_HELP = (
    "The values of the parameters of the plugin (see Plugin.parameters_schema) for this job, as {name: value}. Any algorithm "
    "(image analysis or registration) can take parameters; names that are not in the schema are ignored by the plugin, "
    "missing ones fall back to the default of the schema."
)

ADD_COLUMNS = """
ALTER TABLE processing_plugin ADD COLUMN IF NOT EXISTS plugin_type smallint NOT NULL DEFAULT 1;
ALTER TABLE processing_plugin ADD COLUMN IF NOT EXISTS parameters_schema jsonb;
ALTER TABLE processing_pluginjob ADD COLUMN IF NOT EXISTS target_image_id bigint
    REFERENCES images_image(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE processing_pluginjob ADD COLUMN IF NOT EXISTS parameters jsonb;
CREATE INDEX IF NOT EXISTS processing_pluginjob_target_image_id ON processing_pluginjob (target_image_id);
"""

REVERSE = """
DROP INDEX IF EXISTS processing_pluginjob_target_image_id;
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
                    field=models.JSONField(blank=True, null=True, help_text=PARAMETERS_HELP),
                ),
            ],
        ),
    ]
