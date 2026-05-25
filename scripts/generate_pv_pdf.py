#!/usr/bin/env python3
"""
Script pour générer un PDF du Procès-Verbal d'Assemblée Constitutive
Association HYPERVISIA - Loi 1901
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from datetime import datetime

def generate_pv_pdf(output_filename="docs/PROCES_VERBAL_ASSEMBLEE_CONSTITUTIVE.pdf"):
    """Génère le PDF du procès-verbal"""
    
    # Créer le document
    doc = SimpleDocTemplate(
        output_filename,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    # Styles
    styles = getSampleStyleSheet()
    
    # Style pour le titre principal
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.HexColor('#1a1a1a'),
        spaceAfter=30,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    # Style pour les sous-titres
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#1a1a1a'),
        spaceAfter=12,
        spaceBefore=20,
        fontName='Helvetica-Bold'
    )
    
    # Style pour le texte normal
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=11,
        textColor=colors.HexColor('#333333'),
        alignment=TA_JUSTIFY,
        spaceAfter=12,
        leading=16
    )
    
    # Style pour le texte centré
    center_style = ParagraphStyle(
        'CustomCenter',
        parent=styles['Normal'],
        fontSize=11,
        textColor=colors.HexColor('#333333'),
        alignment=TA_CENTER,
        spaceAfter=12
    )
    
    # Contenu du document
    story = []
    
    # En-tête avec logo/nom association
    story.append(Paragraph("ASSOCIATION HYPERVISIA", title_style))
    story.append(Paragraph("Loi 1901", center_style))
    story.append(Spacer(1, 0.5*cm))
    
    # Titre du document
    story.append(Paragraph("PROCÈS-VERBAL D'ASSEMBLÉE CONSTITUTIVE", title_style))
    story.append(Spacer(1, 0.5*cm))
    
    # Introduction
    intro_text = """
    Le <b>20 février 2026</b> à <b>20h</b>, les membres fondateurs se sont réunis au 
    <b>Restaurant le BOUZOU</b>, 753 Route de la Pompignane, 34170 Castelnau-le-Lez, 
    afin de constituer une association régie par la loi du 1er juillet 1901.
    """
    story.append(Paragraph(intro_text, normal_style))
    story.append(Spacer(1, 0.5*cm))
    
    # Ordre du jour
    story.append(Paragraph("ORDRE DU JOUR", heading_style))
    ordre_du_jour = [
        "Création de l'association",
        "Adoption des statuts",
        "Élection du Bureau",
        "Fixation de la cotisation annuelle",
        "Pouvoirs pour déclaration en préfecture"
    ]
    for item in ordre_du_jour:
        story.append(Paragraph(f"• {item}", normal_style))
    story.append(Spacer(1, 0.5*cm))
    
    # Déroulé
    story.append(Paragraph("DÉROULÉ DE L'ASSEMBLÉE", heading_style))
    
    # 1. Création
    story.append(Paragraph("<b>1. Création de l'association</b>", normal_style))
    story.append(Paragraph(
        "Les participants décident à l'unanimité de créer l'association dénommée <b>HYPERVISIA</b>.",
        normal_style
    ))
    story.append(Spacer(1, 0.3*cm))
    
    # 2. Statuts
    story.append(Paragraph("<b>2. Adoption des statuts</b>", normal_style))
    story.append(Paragraph(
        "Les statuts de l'association sont lus et adoptés à l'unanimité par les membres fondateurs présents.",
        normal_style
    ))
    story.append(Spacer(1, 0.3*cm))
    
    # 3. Bureau
    story.append(Paragraph("<b>3. Élection du Bureau</b>", heading_style))
    story.append(Paragraph(
        "Les membres fondateurs procèdent à l'élection du Bureau de l'association. "
        "Sont élus à l'unanimité :",
        normal_style
    ))
    story.append(Spacer(1, 0.2*cm))
    
    # Tableau du bureau
    bureau_data = [
        ['Fonction', 'Nom et Prénom'],
        ['Président', 'Samuel LEPETRE'],
        ['Trésorier', 'Thibaud BRUNEL'],
        ['Secrétaire', 'Nael LEPETRE']
    ]
    
    bureau_table = Table(bureau_data, colWidths=[6*cm, 9*cm])
    bureau_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('TOPPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 1, colors.grey),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('TOPPADDING', (0, 1), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
    ]))
    
    story.append(bureau_table)
    story.append(Spacer(1, 0.5*cm))
    
    # 4. Cotisation
    story.append(Paragraph("<b>4. Fixation de la cotisation</b>", heading_style))
    story.append(Paragraph(
        "La cotisation annuelle est fixée à <b>99 euros</b> par membre.",
        normal_style
    ))
    story.append(Spacer(1, 0.3*cm))
    
    # 5. Pouvoirs
    story.append(Paragraph("<b>5. Pouvoirs pour déclaration</b>", heading_style))
    story.append(Paragraph(
        "Pouvoir est donné au Président, Monsieur Samuel LEPETRE, pour effectuer toutes les "
        "démarches nécessaires à la déclaration de l'association en préfecture et à sa publication "
        "au Journal Officiel.",
        normal_style
    ))
    story.append(Spacer(1, 0.5*cm))
    
    # Clôture
    story.append(Paragraph(
        "La séance est levée à <b>21h00</b>.",
        normal_style
    ))
    story.append(Spacer(1, 1*cm))
    
    # Signatures
    story.append(Paragraph(
        f"Fait à VERRIERES LE BUISSON, le 16 février 2026",
        center_style
    ))
    story.append(Spacer(1, 1*cm))
    
    # Tableau des signatures
    signatures_data = [
        ['Le Président', 'Le Trésorier', 'Le Secrétaire'],
        ['Samuel LEPETRE', 'Thibaud BRUNEL', 'Nael LEPETRE'],
        ['', '', ''],
        ['', '', ''],
    ]
    
    signatures_table = Table(signatures_data, colWidths=[5*cm, 5*cm, 5*cm])
    signatures_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('FONTNAME', (0, 1), (-1, 1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, 1), 9),
        ('LINEABOVE', (0, 2), (-1, 2), 1, colors.black),
        ('TOPPADDING', (0, 0), (-1, 1), 8),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 20),
    ]))
    
    story.append(signatures_table)
    
    # Pied de page
    story.append(Spacer(1, 1*cm))
    story.append(Paragraph(
        "<i>Association HYPERVISIA - Siège social : 2 square des coquelicots, 91370 Verrières-le-Buisson</i>",
        ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.grey,
            alignment=TA_CENTER
        )
    ))
    
    # Générer le PDF
    doc.build(story)
    print(f"✅ PDF généré avec succès : {output_filename}")
    return output_filename


if __name__ == "__main__":
    generate_pv_pdf()
