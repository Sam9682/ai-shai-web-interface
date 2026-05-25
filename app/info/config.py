"""Configuration for association information
This file contains static information about the HYPERVISIA association.
In a production environment, this could be stored in a database or CMS.
"""
from datetime import date
from app.info.schemas import (
    AssociationInfo, 
    BoardMember, 
    LegalDocument,
    FinancialReport
)


# Association basic information (Requirements 1.1, 8.1, 8.2)
ASSOCIATION_INFO = AssociationInfo(
    name="HYPERVISIA",
    address="123 Rue de l'Association, 75001 Paris, France",
    siret="12345678900012",  # Example SIRET number
    board_members=[
        BoardMember(
            name="Jean Dupont",
            position="Président",
            email="president@hypervisia.fr"
        ),
        BoardMember(
            name="Marie Martin",
            position="Trésorière",
            email="tresorier@hypervisia.fr"
        ),
        BoardMember(
            name="Pierre Durand",
            position="Secrétaire",
            email="secretaire@hypervisia.fr"
        )
    ]
)

# Mission and activities (Requirements 1.2)
MISSION = """HYPERVISIA est une association loi 1901 dédiée à la promotion et au développement 
des technologies de l'information et de la communication. Notre mission est de créer un espace 
d'échange et de partage de connaissances pour tous les passionnés de technologie."""

ACTIVITIES = """Nos activités incluent :
- Organisation de conférences et d'ateliers techniques
- Mise en place de groupes de travail thématiques
- Développement de projets collaboratifs open source
- Événements de networking pour les membres
- Formation continue et partage de compétences
- Participation à des événements communautaires"""

# Contact information (Requirement 1.4)
CONTACT_EMAIL = "contact@hypervisia.fr"
CONTACT_PHONE = "+33 1 23 45 67 89"

# Legal documents (Requirements 8.2, 8.3)
STATUTES = LegalDocument(
    title="Statuts de l'Association HYPERVISIA",
    description="Les statuts définissent l'objet, le fonctionnement et les règles de l'association conformément à la loi 1901.",
    content="""STATUTS DE L'ASSOCIATION HYPERVISIA

Article 1 - Constitution et dénomination
Il est fondé entre les adhérents aux présents statuts une association régie par la loi du 1er juillet 1901 
et le décret du 16 août 1901, ayant pour dénomination : HYPERVISIA.

Article 2 - Objet
Cette association a pour objet la promotion et le développement des technologies de l'information 
et de la communication à travers l'organisation d'événements, de formations et de projets collaboratifs.

Article 3 - Siège social
Le siège social est fixé au 123 Rue de l'Association, 75001 Paris, France.

Article 4 - Durée
La durée de l'association est illimitée.

Article 5 - Composition
L'association se compose de membres actifs qui versent une cotisation annuelle.

Article 6 - Admission
Pour faire partie de l'association, il faut être agréé par le bureau qui statue lors de chacune de ses réunions.

Article 7 - Cotisations
Le montant de la cotisation annuelle est fixé par l'assemblée générale.

Article 8 - Bureau
L'association est dirigée par un bureau composé de :
- Un(e) Président(e)
- Un(e) Trésorier(ère)
- Un(e) Secrétaire

Article 9 - Assemblée générale
L'assemblée générale ordinaire se réunit au moins une fois par an."""
)

REGULATIONS = LegalDocument(
    title="Règlement Intérieur de l'Association HYPERVISIA",
    description="Le règlement intérieur précise les modalités d'application des statuts et les règles de fonctionnement quotidien.",
    content="""RÈGLEMENT INTÉRIEUR DE L'ASSOCIATION HYPERVISIA

Article 1 - Adhésion
L'adhésion à l'association est valable pour l'année civile en cours. Le montant de la cotisation 
est fixé à 50€ par an.

Article 2 - Participation aux activités
Les membres à jour de leur cotisation peuvent participer à toutes les activités de l'association.

Article 3 - Forum et communication
Les membres s'engagent à respecter les règles de courtoisie et de bienveillance dans leurs échanges 
sur le forum et lors des événements.

Article 4 - Protection des données
L'association s'engage à protéger les données personnelles de ses membres conformément au RGPD.

Article 5 - Modification du règlement
Le présent règlement peut être modifié par décision du bureau, sous réserve de ratification 
par l'assemblée générale."""
)

# Financial reports (Requirement 8.5)
# In a real application, these would be fetched from the database
FINANCIAL_REPORTS = [
    FinancialReport(
        id="report-2024",
        title="Rapport Financier 2024",
        year=2024,
        description="Rapport financier annuel incluant le bilan, le compte de résultat et les notes explicatives.",
        published_date=date(2024, 12, 31)
    ),
    FinancialReport(
        id="report-2023",
        title="Rapport Financier 2023",
        year=2023,
        description="Rapport financier annuel incluant le bilan, le compte de résultat et les notes explicatives.",
        published_date=date(2023, 12, 31)
    ),
    FinancialReport(
        id="report-2022",
        title="Rapport Financier 2022",
        year=2022,
        description="Rapport financier annuel incluant le bilan, le compte de résultat et les notes explicatives.",
        published_date=date(2022, 12, 31)
    )
]

# Board information last updated date
BOARD_LAST_UPDATED = date(2024, 1, 15)
