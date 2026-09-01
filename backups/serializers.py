from pathlib import PurePosixPath

from croniter import croniter
from rest_framework import serializers

from clusters.models import App

from .models import Backup


class BackupCreateSerializer(serializers.Serializer):
    app_id = serializers.PrimaryKeyRelatedField(source="app", queryset=App.objects.all())
    source_path = serializers.CharField(max_length=1000)
    schedule = serializers.CharField(max_length=100, required=False, allow_blank=False)

    def validate_source_path(self, value):
        path = PurePosixPath(value)
        if not path.is_absolute() or value == "/" or ".." in path.parts:
            raise serializers.ValidationError("source_path must be a safe absolute path inside the app container.")
        return str(path)

    def validate_schedule(self, value):
        if len(value.split()) != 5 or not croniter.is_valid(value):
            raise serializers.ValidationError("schedule must be a valid five-field cron expression.")
        return value


class BackupSerializer(serializers.ModelSerializer):
    backup_id = serializers.CharField(source="id", read_only=True)
    app_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Backup
        fields = [
            "backup_id",
            "app_id",
            "source_path",
            "status",
            "output_path",
            "error_message",
            "created_at",
            "started_at",
            "finished_at",
        ]
        read_only_fields = fields
