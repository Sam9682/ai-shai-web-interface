#!/usr/bin/env python3
"""
Script pour générer tous les PDFs des documents officiels de l'association HYPERVISIA
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib import colors


def create_common_styles():
    """Crée les styles communs pour tous les documents"""
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.HexColor('#1a1a1a'),
        spaceAfter=30,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#1a1a1a'),
        spaceAfter=12,
        spaceBefore=20,
        fontName='Helvetica-Bold'
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=11,
        textColor=colors.HexColor('#333333'),
        alignment=TA_JUSTIFY,
        spaceAfter=12,
        leading=16
    )
    
    center_style = ParagraphStyle(
        'CustomCenter',
        parent=styles['Normal'],
        fontSize=11,
        textColor=colors.HexColor('#333333'),
        alignment=TA_CENTER,
        spaceAfter=12
    )
    
    return {
        'title': title_style,
        'heading': heading_style,
        'normal': normal_style,
        'center': center_style
    }


def generate_pv_pdf(output_filename="docs/PROCES_VERBAL_ASSEMBLEE_CONSTITUTIVE.pdf"):
    """Génère le PDF du procès-verbal de l'assemblée constitutive"""
    
    doc = SimpleDocTemplate(
        output_filename,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    styles = create_common_styles()
    story = []
    
    # En-tête
    story.append(Paragraph("PROCÈS-VERBAL", styles['title']))
    story.append(Spacer(1, 0.5*cm))
    
    # Introduction
    story.append(Paragraph(
        "Le 16 février 2026 à 20h, les membres fondateurs se sont réunis 2 square des coquelicots, "
        "91370 VERRIERES LE BUISSON, afin de constituer une association loi 1901.",
        styles['normal']
    ))
    story.append(Spacer(1, 0.5*cm))
    
    # Ordre du jour
    story.append(Paragraph("Ordre du jour", styles['heading']))
    story.append(Paragraph("Création de l'association", styles['normal']))
    story.append(Paragraph("Adoption des statuts", styles['normal']))
    story.append(Paragraph("Élection du Bureau", styles['normal']))
    story.append(Paragraph("Fixation de la cotisation", styles['normal']))
    story.append(Paragraph("Pouvoirs pour déclaration", styles['normal']))
    story.append(Spacer(1, 0.5*cm))
    
    # Déroulé
    story.append(Paragraph("Déroulé", styles['heading']))
    story.append(Paragraph(
        "Les participants décident de créer l'association HYPERVISIA.",
        styles['normal']
    ))
    story.append(Paragraph(
        "Les statuts sont lus et adoptés à l'unanimité.",
        styles['normal']
    ))
    story.append(Spacer(1, 0.5*cm))
    
    # Élection du Bureau
    story.append(Paragraph("Élection du Bureau", styles['heading']))
    story.append(Paragraph("Sont élus :", styles['normal']))
    story.append(Paragraph("Président : Samuel LEPETRE", styles['normal']))
    story.append(Paragraph("Trésorier : Thibaud BRUNEL", styles['normal']))
    story.append(Paragraph("Secrétaire : Nael LEPETRE", styles['normal']))
    story.append(Spacer(1, 0.5*cm))
    
    # Cotisation
    story.append(Paragraph("Cotisation", styles['heading']))
    story.append(Paragraph("La cotisation annuelle est fixée à : 99 €.", styles['normal']))
    story.append(Spacer(1, 0.5*cm))
    
    # Pouvoirs
    story.append(Paragraph("Pouvoirs", styles['heading']))
    story.append(Paragraph(
        "Pouvoir est donné au Président pour effectuer les démarches de déclaration en préfecture et publication.",
        styles['normal']
    ))
    story.append(Spacer(1, 0.5*cm))
    
    # Clôture
    story.append(Paragraph("La séance est levée à 21h.", styles['normal']))
    story.append(Spacer(1, 1*cm))
    
    # Signatures
    story.append(Paragraph("Fait à VERRIERES LE BUISSON, le 16 février 2026", styles['center']))

    story.append(Spacer(1, 0.5*cm))
    
    signatures_data = [
        ['Le Président', 'Le Trésorier', 'Le Secrétaire'],
        ['Samuel LEPETRE', 'Thibaud BRUNEL', 'Nael LEPETRE'],
        ['Signature :', 'Signature :', 'Signature :']
    ]
    
    signatures_table = Table(signatures_data, colWidths=[5*cm, 5*cm, 5*cm])
    signatures_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('FONTNAME', (0, 1), (-1, 2), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, 1), 9),
        ('FONTSIZE', (0, 2), (-1, 2), 8),
        ('TOPPADDING', (0, 0), (-1, 2), 8),
    ]))
    
    story.append(signatures_table)
    
    doc.build(story)
    print(f"✅ PDF généré : {output_filename}")


def generate_statuts_pdf(output_filename="docs/STATUTS_ASSOCIATION_HYPERVISIA.pdf"):
    """Génère le PDF des statuts de l'association"""
    
    doc = SimpleDocTemplate(
        output_filename,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    styles = create_common_styles()
    story = []
    
    # En-tête
    story.append(Paragraph("ASSOCIATION HYPERVISIA", styles['title']))
    story.append(Paragraph("Loi 1901", styles['center']))
    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("STATUTS DE L'ASSOCIATION", styles['title']))
    story.append(Spacer(1, 0.5*cm))
    
    # Article 1
    story.append(Paragraph("Article 1 — Dénomination", styles['heading']))
    story.append(Paragraph(
        "Il est fondé entre les adhérents aux présents statuts une association ayant pour titre : "
        "<b>HYPERVISIA</b>, ci-après dénommée « l'Association ».",
        styles['normal']
    ))
    
    # Article 2
    story.append(Paragraph("Article 2 — Objet", styles['heading']))
    story.append(Paragraph(
        "L'Association a pour objet de promouvoir la compréhension, l'usage, la recherche appliquée "
        "et le développement de l'intelligence artificielle, notamment par :",
        styles['normal']
    ))
    story.append(Paragraph("• des actions de sensibilisation et de vulgarisation,", styles['normal']))
    story.append(Paragraph("• des formations et ateliers,", styles['normal']))
    story.append(Paragraph("• des événements (conférences, rencontres, hackathons),", styles['normal']))
    story.append(Paragraph("• l'accompagnement de projets et d'expérimentations,", styles['normal']))
    story.append(Paragraph("• la mise en réseau d'acteurs (citoyens, étudiants, professionnels, entreprises, institutions),", styles['normal']))
    story.append(Paragraph("• l'accès à des outils, plateformes ou ressources, dont notamment la plateforme Softfluid.fr, selon les conditions définies par l'Association.", styles['normal']))
    
    # Article 3
    story.append(Paragraph("Article 3 — Moyens d'action", styles['heading']))
    story.append(Paragraph("Les moyens d'action de l'Association incluent notamment :", styles['normal']))
    story.append(Paragraph("• organisation d'événements,", styles['normal']))
    story.append(Paragraph("• publication de ressources (guides, contenus pédagogiques),", styles['normal']))
    story.append(Paragraph("• mise à disposition d'outils numériques,", styles['normal']))
    story.append(Paragraph("• partenariats avec entreprises, établissements d'enseignement, collectivités,", styles['normal']))
    story.append(Paragraph("• prestations d'accompagnement, dans la limite du cadre légal des associations.", styles['normal']))
    
    # Article 4
    story.append(Paragraph("Article 4 — Siège social", styles['heading']))
    story.append(Paragraph(
        "Le siège social est fixé à : <b>2 square des coquelicots 91370 VERRIERES LE BUISSON</b>. "
        "Il pourra être transféré par décision du Bureau et ratifié par l'Assemblée Générale.",
        styles['normal']
    ))
    
    # Article 5
    story.append(Paragraph("Article 5 — Durée", styles['heading']))
    story.append(Paragraph("La durée de l'Association est illimitée.", styles['normal']))
    
    # Section Membres
    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("MEMBRES", styles['title']))
    
    # Article 6
    story.append(Paragraph("Article 6 — Composition", styles['heading']))
    story.append(Paragraph("L'Association se compose de :", styles['normal']))
    story.append(Paragraph("• membres adhérents", styles['normal']))
    story.append(Paragraph("• membres bienfaiteurs (optionnel)", styles['normal']))
    story.append(Paragraph("• membres d'honneur (optionnel)", styles['normal']))
    
    # Article 7
    story.append(Paragraph("Article 7 — Admission", styles['heading']))
    story.append(Paragraph(
        "L'adhésion est ouverte à toute personne physique ou morale qui accepte les présents statuts "
        "et le règlement intérieur le cas échéant.",
        styles['normal']
    ))
    
    # Article 8
    story.append(Paragraph("Article 8 — Cotisation", styles['heading']))
    story.append(Paragraph(
        "Le montant de la cotisation annuelle est fixé chaque année par l'Assemblée Générale.",
        styles['normal']
    ))
    
    # Article 9
    story.append(Paragraph("Article 9 — Perte de la qualité de membre", styles['heading']))
    story.append(Paragraph("La qualité de membre se perd par :", styles['normal']))
    story.append(Paragraph("• démission,", styles['normal']))
    story.append(Paragraph("• décès,", styles['normal']))
    story.append(Paragraph("• radiation prononcée par le Bureau pour non-paiement de la cotisation ou motif grave, après échange contradictoire.", styles['normal']))
    
    # Section Administration
    story.append(PageBreak())
    story.append(Paragraph("ADMINISTRATION ET FONCTIONNEMENT", styles['title']))
    
    # Article 10
    story.append(Paragraph("Article 10 — Bureau", styles['heading']))
    story.append(Paragraph("L'Association est administrée par un Bureau composé au minimum de :", styles['normal']))
    story.append(Paragraph("• un Président", styles['normal']))
    story.append(Paragraph("• un Trésorier", styles['normal']))
    story.append(Paragraph("• un Secrétaire", styles['normal']))
    
    # Article 11
    story.append(Paragraph("Article 11 — Élection du Bureau", styles['heading']))
    story.append(Paragraph(
        "Les membres du Bureau sont élus par l'Assemblée Générale pour une durée de 2 ans. Ils sont rééligibles.",
        styles['normal']
    ))
    
    # Article 12
    story.append(Paragraph("Article 12 — Rôle du Bureau", styles['heading']))
    story.append(Paragraph("Le Bureau :", styles['normal']))
    story.append(Paragraph("• met en œuvre les décisions de l'Assemblée Générale,", styles['normal']))
    story.append(Paragraph("• organise les activités,", styles['normal']))
    story.append(Paragraph("• gère les finances,", styles['normal']))
    story.append(Paragraph("• représente l'Association.", styles['normal']))
    story.append(Paragraph(
        "Le Bureau peut désigner des responsables de pôles ou de commissions thématiques "
        "(informatique, mathématique, enseignement, CHR, etc.), chargés de piloter les actions dans leur domaine. "
        "Ces responsables rendent compte au Bureau, et ne disposent pas, sauf délégation expresse, "
        "d'un pouvoir de représentation légale.",
        styles['normal']
    ))
    
    # Article 13
    story.append(Paragraph("Article 13 — Assemblée Générale Ordinaire", styles['heading']))
    story.append(Paragraph("L'Assemblée Générale se réunit au moins une fois par an. Elle :", styles['normal']))
    story.append(Paragraph("• approuve le rapport moral,", styles['normal']))
    story.append(Paragraph("• approuve le rapport financier,", styles['normal']))
    story.append(Paragraph("• vote le budget,", styles['normal']))
    story.append(Paragraph("• fixe le montant des cotisations,", styles['normal']))
    story.append(Paragraph("• élit ou renouvelle le Bureau.", styles['normal']))
    
    # Article 14
    story.append(Paragraph("Article 14 — Assemblée Générale Extraordinaire", styles['heading']))
    story.append(Paragraph(
        "Une Assemblée Générale Extraordinaire peut être convoquée pour modification des statuts ou dissolution.",
        styles['normal']
    ))
    
    # Article 15
    story.append(Paragraph("Article 15 — Ressources", styles['heading']))
    story.append(Paragraph("Les ressources de l'Association comprennent :", styles['normal']))
    story.append(Paragraph("• cotisations,", styles['normal']))
    story.append(Paragraph("• subventions,", styles['normal']))
    story.append(Paragraph("• dons,", styles['normal']))
    story.append(Paragraph("• recettes issues d'événements,", styles['normal']))
    story.append(Paragraph("• recettes issues de services, formations, ou mise à disposition d'outils numériques,", styles['normal']))
    story.append(Paragraph("• toute autre ressource autorisée par la loi.", styles['normal']))
    
    # Article 16
    story.append(Paragraph("Article 16 — Comptabilité", styles['heading']))
    story.append(Paragraph(
        "Il est tenu une comptabilité, permettant de justifier les comptes annuels.",
        styles['normal']
    ))
    
    # Article 17
    story.append(Paragraph("Article 17 — Dissolution", styles['heading']))
    story.append(Paragraph(
        "En cas de dissolution, l'actif net est attribué à une association poursuivant un objet similaire, "
        "conformément aux décisions de l'Assemblée Générale.",
        styles['normal']
    ))
    
    # Article 18
    story.append(Paragraph("Article 18 — Règlement intérieur", styles['heading']))
    story.append(Paragraph(
        "Un règlement intérieur peut être établi par le Bureau et soumis à l'Assemblée Générale.",
        styles['normal']
    ))
    
    # Signatures
    story.append(Spacer(1, 1*cm))
    story.append(Paragraph("Fait à VERRIERES LE BUISSON, le 16 février 2026", styles['center']))
    story.append(Spacer(1, 0.5*cm))
    
    signatures_data = [
        ['Le Président', 'Le Trésorier', 'Le Secrétaire'],
        ['Samuel LEPETRE', 'Thibaud BRUNEL', 'Nael LEPETRE'],
        ['Signature :', 'Signature :', 'Signature :']
    ]
    
    signatures_table = Table(signatures_data, colWidths=[5*cm, 5*cm, 5*cm])
    signatures_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('FONTNAME', (0, 1), (-1, 2), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, 1), 9),
        ('FONTSIZE', (0, 2), (-1, 2), 8),
        ('TOPPADDING', (0, 0), (-1, 2), 8),
    ]))
    
    story.append(signatures_table)

    doc.build(story)
    print(f"✅ PDF généré : {output_filename}")


def generate_reglement_pdf(output_filename="docs/REGLEMENT_INTERIEUR.pdf"):
    """Génère le PDF du règlement intérieur"""
    
    doc = SimpleDocTemplate(
        output_filename,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    styles = create_common_styles()
    story = []
    
    # En-tête
    story.append(Paragraph("ASSOCIATION HYPERVISIA", styles['title']))
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("RÈGLEMENT INTÉRIEUR", styles['title']))
    story.append(Spacer(1, 0.5*cm))
    
    # Article 1
    story.append(Paragraph("Article 1 — Objet", styles['heading']))
    story.append(Paragraph(
        "Le présent règlement intérieur complète les statuts de l'Association. Il précise les modalités "
        "pratiques de fonctionnement, notamment l'organisation des pôles thématiques et les conditions "
        "d'usage des outils numériques.",
        styles['normal']
    ))
    
    # Article 2
    story.append(Paragraph("Article 2 — Adhésion et catégories de membres", styles['heading']))
    story.append(Paragraph("L'Association distingue :", styles['normal']))
    story.append(Paragraph("• les membres adhérents (personnes physiques) ;", styles['normal']))
    story.append(Paragraph("• les membres personnes morales (entreprises, associations, établissements) ;", styles['normal']))
    story.append(Paragraph("• les membres bienfaiteurs (optionnel) ;", styles['normal']))
    story.append(Paragraph("• les membres d'honneur (optionnel).", styles['normal']))
    story.append(Paragraph(
        "Le Bureau peut fixer des modalités d'adhésion spécifiques pour les personnes morales "
        "(ex. participation annuelle, convention de partenariat).",
        styles['normal']
    ))
    
    # Article 3
    story.append(Paragraph("Article 3 — Cotisations et contributions", styles['heading']))
    story.append(Paragraph(
        "La cotisation annuelle est fixée par l'Assemblée Générale. Des contributions spécifiques peuvent "
        "être demandées pour :",
        styles['normal']
    ))
    story.append(Paragraph("• participation à certains événements ;", styles['normal']))
    story.append(Paragraph("• accès à certains services ou formations ;", styles['normal']))
    story.append(Paragraph("• usage professionnel de ressources numériques, notamment Softfluid.fr, dans le cadre d'une convention.", styles['normal']))
    
    # Article 4
    story.append(Paragraph("Article 4 — Bureau", styles['heading']))
    story.append(Paragraph(
        "Le Bureau assure la gestion courante. Il peut se réunir autant que nécessaire. Les décisions sont "
        "prises à la majorité des membres présents. En cas d'égalité, la voix du Président est prépondérante.",
        styles['normal']
    ))
    
    # Article 5
    story.append(Paragraph("Article 5 — Pôles thématiques", styles['heading']))
    story.append(Paragraph(
        "Des pôles peuvent être créés afin de structurer les actions de l'Association (ex. Informatique, "
        "Enseignement & Mathématiques, CHR, Industrie, Santé, Communication, etc.).",
        styles['normal']
    ))
    story.append(Paragraph(
        "Chaque pôle est animé par un responsable de pôle, éventuellement assisté d'un adjoint. "
        "Les responsables de pôles sont désignés par le Bureau pour une durée de 1 an renouvelable, "
        "ou élus par l'Assemblée Générale si elle en décide.",
        styles['normal']
    ))
    story.append(Paragraph("Le responsable de pôle :", styles['normal']))
    story.append(Paragraph("• propose un plan d'actions ;", styles['normal']))
    story.append(Paragraph("• organise les activités du pôle ;", styles['normal']))
    story.append(Paragraph("• fait remonter les besoins et projets au Bureau ;", styles['normal']))
    story.append(Paragraph("• rend compte au Bureau et à l'Assemblée Générale.", styles['normal']))
    
    # Article 6
    story.append(Paragraph("Article 6 — Commissions et groupes de travail", styles['heading']))
    story.append(Paragraph(
        "Le Bureau peut créer des commissions temporaires (ex. organisation d'un événement, rédaction de "
        "contenus, relations partenaires). Elles rendent compte au Bureau.",
        styles['normal']
    ))
    
    # Article 7
    story.append(Paragraph("Article 7 — Usage de la plateforme Softfluid.fr", styles['heading']))
    story.append(Paragraph(
        "La plateforme Softfluid.fr peut être utilisée par l'Association comme outil pédagogique, de "
        "démonstration ou d'expérimentation.",
        styles['normal']
    ))
    story.append(Paragraph(
        "Pour les personnes morales (entreprises), un accès ou une utilisation professionnelle peut donner "
        "lieu à une convention et à une participation financière, conformément aux objectifs de l'Association "
        "et dans le respect de la réglementation applicable.",
        styles['normal']
    ))
    
    # Article 8
    story.append(Paragraph("Article 8 — Communication et image", styles['heading']))
    story.append(Paragraph(
        "Les supports de communication de l'Association (site web Hypervisia.fr, réseaux sociaux, documents) "
        "doivent respecter l'objet de l'Association et la neutralité de l'organisation.",
        styles['normal']
    ))
    
    # Article 9
    story.append(Paragraph("Article 9 — Gestion des conflits d'intérêts", styles['heading']))
    story.append(Paragraph(
        "Tout membre du Bureau ou responsable de pôle ayant un intérêt personnel ou professionnel dans une "
        "décision doit le déclarer et s'abstenir de participer au vote correspondant.",
        styles['normal']
    ))
    
    # Article 10
    story.append(Paragraph("Article 10 — Modification du règlement intérieur", styles['heading']))
    story.append(Paragraph(
        "Le règlement intérieur est modifiable par décision du Bureau et soumis pour information ou "
        "validation à la plus proche Assemblée Générale.",
        styles['normal']
    ))
    
    # Signatures
    story.append(Spacer(1, 1*cm))
    story.append(Paragraph("Fait à VERRIERES LE BUISSON, le 16 février 2026.", styles['center']))
    story.append(Spacer(1, 0.5*cm))
    
    signatures_data = [
        ['Le Président', 'Le Trésorier', 'Le Secrétaire'],
        ['Samuel LEPETRE', 'Thibaud BRUNEL', 'Nael LEPETRE'],
        ['Signature :', 'Signature :', 'Signature :']
    ]
    
    signatures_table = Table(signatures_data, colWidths=[5*cm, 5*cm, 5*cm])
    signatures_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('FONTNAME', (0, 1), (-1, 2), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, 1), 9),
        ('FONTSIZE', (0, 2), (-1, 2), 8),
        ('TOPPADDING', (0, 0), (-1, 2), 8),
    ]))
    
    story.append(signatures_table)
    
    doc.build(story)
    print(f"✅ PDF généré : {output_filename}")


def generate_dirigeants_pdf(output_filename="docs/LISTE_DES_DIRIGEANTS.pdf"):
    """Génère le PDF de la liste des dirigeants"""
    
    doc = SimpleDocTemplate(
        output_filename,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    styles = create_common_styles()
    story = []
    
    # En-tête
    story.append(Paragraph("ASSOCIATION HYPERVISIA", styles['title']))
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("LISTE DES DIRIGEANTS", styles['title']))
    story.append(Spacer(1, 1*cm))
    
    # Informations association
    story.append(Paragraph("<b>Association :</b> HYPERVISIA", styles['normal']))
    story.append(Paragraph(
        "<b>Siège :</b> 2 square des coquelicots 91370 VERRIERES LE BUISSON",
        styles['normal']
    ))
    story.append(Spacer(1, 1*cm))
    
    # Tableau des dirigeants
    story.append(Paragraph("COMPOSITION DU BUREAU", styles['heading']))
    story.append(Spacer(1, 0.5*cm))
    
    dirigeants_data = [
        ['Fonction', 'Identité'],
        [
            'Président',
            'Samuel LEPETRE\nNé le 2 Aout 1969\nNationalité française\nDomicilié au 2 square des coquelicots\n91370 VERRIERES LE BUISSON'
        ],
        [
            'Trésorier',
            'Thibaud BRUNEL\nNé le 30 Septembre 1970\nNationalité française\nDomicilié au 8 allee des meulieres, \nrésidence Écrins des Meulières , appt 104, \n34170 CASTELNAU LE LEZ'
        ],
        [
            'Secrétaire',
            'Nael LEPETRE\nNé le 8 Mai 2002\nNationalité française\nDomicilié chemin des mouilles\nECULLY 69130'
        ]
    ]
    
    dirigeants_table = Table(dirigeants_data, colWidths=[4*cm, 11*cm])
    dirigeants_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('TOPPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 1, colors.grey),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('TOPPADDING', (0, 1), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 12),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    
    story.append(dirigeants_table)
    story.append(Spacer(1, 1*cm))
    
    # Note
    story.append(Paragraph(
        "<i>Document établi conformément aux exigences de la loi du 1er juillet 1901 "
        "relative au contrat d'association.</i>",
        ParagraphStyle(
            'Note',
            parent=styles['normal'],
            fontSize=9,
            textColor=colors.grey,
            alignment=TA_JUSTIFY
        )
    ))
    
    story.append(Spacer(1, 1*cm))
    story.append(Paragraph("Fait à VERRIERES LE BUISSON, le 16 février 2026", styles['center']))
    
    doc.build(story)
    print(f"✅ PDF généré : {output_filename}")


if __name__ == "__main__":
    print("Génération des PDFs des documents officiels HYPERVISIA...\n")
    generate_pv_pdf()
    generate_statuts_pdf()
    generate_reglement_pdf()
    generate_dirigeants_pdf()
    print("\n✅ Tous les PDFs ont été générés avec succès !")
