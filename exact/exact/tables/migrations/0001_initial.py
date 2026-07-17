from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('images', '0038_image_creator'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='TableDataset',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('creator', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_tables', to=settings.AUTH_USER_MODEL)),
                ('image_set', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tables', to='images.imageset')),
            ],
            options={'ordering': ['name']},
        ),
        migrations.CreateModel(
            name='TableVersion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('version_number', models.PositiveIntegerField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('comment', models.CharField(blank=True, max_length=500)),
                ('data', models.BinaryField(blank=True, null=True)),
                ('patch', models.BinaryField(blank=True, null=True)),
                ('row_count', models.IntegerField(default=0)),
                ('col_count', models.IntegerField(default=0)),
                ('is_current', models.BooleanField(db_index=True, default=False)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='table_versions', to=settings.AUTH_USER_MODEL)),
                ('dataset', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='versions', to='tables.tabledataset')),
            ],
            options={'ordering': ['-version_number'], 'unique_together': {('dataset', 'version_number')}},
        ),
        migrations.CreateModel(
            name='TableViewSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('settings_json', models.JSONField(default=dict)),
                ('dataset', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='view_settings', to='tables.tabledataset')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='table_view_settings', to=settings.AUTH_USER_MODEL)),
            ],
            options={'unique_together': {('dataset', 'user')}},
        ),
    ]
