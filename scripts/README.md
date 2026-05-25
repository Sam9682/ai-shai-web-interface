# Scripts Hypervisia

Ce dossier contient tous les scripts utilitaires pour la gestion de l'application Hypervisia.

## 📦 Sauvegardes de Base de Données

### Scripts Principaux

| Script | Description |
|--------|-------------|
| `backup_database.py` | Sauvegarde la base de données (locale + S3) |
| `restore_database.py` | Restaure depuis une sauvegarde locale |
| `restore_from_s3.py` | Gère les sauvegardes S3 (list/download/restore) |
| `setup_s3_bucket.sh` | Configure le bucket S3 avec les bonnes politiques |
| `test_backup_setup.py` | Vérifie la configuration complète |

### Documentation

| Fichier | Contenu |
|---------|---------|
| `README_BACKUP.md` | Documentation complète du système de sauvegarde |
| `QUICK_START_BACKUP.md` | Guide de démarrage rapide (5 minutes) |
| `COMMANDS_CHEATSHEET.md` | Aide-mémoire des commandes courantes |
| `iam-policy-example.json` | Exemple de politique IAM pour AWS |

### Démarrage Rapide

```bash
# 1. Installer les dépendances
pip install boto3
sudo apt-get install postgresql-client

# 2. Configurer AWS
aws configure

# 3. Créer le bucket S3
bash scripts/setup_s3_bucket.sh

# 4. Tester
python scripts/test_backup_setup.py

# 5. Première sauvegarde
python scripts/backup_database.py
```

### Commandes Courantes

```bash
# Sauvegarde
python scripts/backup_database.py

# Lister les sauvegardes S3
python scripts/restore_from_s3.py list

# Restaurer depuis S3
python scripts/restore_from_s3.py restore 2026/02/20/hypervisia_backup_20260220_143000.sql
```

## 📚 Documentation Complète

Pour plus d'informations, consultez :
- 📖 [Guide complet](README_BACKUP.md)
- 🚀 [Démarrage rapide](QUICK_START_BACKUP.md)
- 📝 [Aide-mémoire](COMMANDS_CHEATSHEET.md)
- 📄 [Configuration principale](../BACKUP_S3_SETUP.md)

## 🔧 Configuration

### Variables d'Environnement Requises

```bash
DATABASE_URL=postgresql://user:password@host:5432/database
```

### Credentials AWS

Configurez avec `aws configure` ou via variables d'environnement :
```bash
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_DEFAULT_REGION=eu-west-3
```

## 🐳 Docker

```bash
# Sauvegarde depuis le conteneur
docker exec -it hypervisia-container python scripts/backup_database.py

# Restaurer depuis le conteneur
docker exec -it hypervisia-container python scripts/restore_from_s3.py restore <s3_key>
```

## 🔒 Sécurité

- ✅ Chiffrement AES256 côté serveur (S3)
- ✅ Versioning activé sur le bucket
- ✅ Accès public bloqué
- ✅ Credentials non stockés dans le code
- ✅ Compression automatique des sauvegardes

## 💰 Coûts

Pour ~10 GB de sauvegardes :
- **~0.50 USD/an** avec lifecycle policy (Glacier après 30j)

## 🆘 Support

1. Consultez la [documentation complète](README_BACKUP.md)
2. Exécutez le [script de test](test_backup_setup.py)
3. Vérifiez l'[aide-mémoire](COMMANDS_CHEATSHEET.md)

## 📝 Licence

Partie du projet Hypervisia
