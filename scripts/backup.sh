#!/bin/bash
# ${NAME_OF_APPLICATION} Backup Script

BACKUP_DIR="backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/ai_haccp_backup_$DATE"

mkdir -p "$BACKUP_DIR"

echo "Creating backup: $BACKUP_FILE"
HTTP_PORT=$HTTP_PORT HTTPS_PORT=$HTTPS_PORT HTTP_PORT2=$HTTP_PORT2 HTTPS_PORT2=$HTTPS_PORT2 USER_ID=$USER_ID docker-compose -p "${NAME_OF_APPLICATION}-${USER_ID}-${HTTPS_PORT}" -f docker-compose.yml exec -T api cp /app/data/ai_haccp.db /tmp/backup.db
docker cp $(docker-compose -p "-$USER_ID-$HTTPS_PORT" -f docker-compose.yml ps -q api):/tmp/backup.db "$BACKUP_FILE.db"

if [[ $? -eq 0 ]]; then
    echo "Backup created successfully: $BACKUP_FILE"
    
    # Keep only last 7 backups
    ls -t "$BACKUP_DIR"/ai_haccp_backup_*.db | tail -n +8 | xargs -r rm
    echo "Old backups cleaned up"
else
    echo "Backup failed!"
    exit 1
fi
