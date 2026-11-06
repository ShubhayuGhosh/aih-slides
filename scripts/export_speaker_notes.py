#!/usr/bin/env python3
"""Export the notes in index.html to a slide-matched, bookmarked PDF.

Requires reportlab. Uses an installed Unicode TrueType font; no font files are
copied into the repository. Run from any directory with Python 3.
"""
from datetime import date
from html import escape
from html.parser import HTMLParser
from pathlib import Path

import reportlab
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
SITE = 'https://shubhayughosh.github.io/aih-slides/'


class DeckNotes(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.slides = []
        self.references = []
        self.current = None
        self.in_notes = self.in_paragraph = self.in_refs = False
        self.paragraph = []
        self.reference = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'section' and 'slide' in attrs.get('class', '').split():
            self.current = {'title': attrs['data-title'], 'backup': 'data-backup' in attrs, 'notes': []}
        elif tag == 'aside' and attrs.get('class') == 'notes':
            self.in_notes = True
        elif tag == 'p' and self.in_notes:
            self.in_paragraph = True
            self.paragraph = []
        elif tag in ('b', 'strong') and self.in_paragraph:
            self.paragraph.append('<b>')
        elif tag == 'br' and self.in_paragraph:
            self.paragraph.append('<br/>')
        elif tag == 'ul' and 'refs' in attrs.get('class', '').split():
            self.in_refs = True
        elif tag == 'a' and self.in_refs:
            self.reference = {'url': attrs['href'], 'text': ''}

    def handle_data(self, data):
        if self.in_paragraph:
            self.paragraph.append(escape(data))
        if self.reference is not None:
            self.reference['text'] += data

    def handle_endtag(self, tag):
        if tag in ('b', 'strong') and self.in_paragraph:
            self.paragraph.append('</b>')
        elif tag == 'p' and self.in_paragraph:
            self.current['notes'].append(''.join(self.paragraph))
            self.in_paragraph = False
        elif tag == 'aside':
            self.in_notes = False
        elif tag == 'section' and self.current is not None:
            self.slides.append(self.current)
            self.current = None
        elif tag == 'a' and self.reference is not None:
            self.references.append(self.reference)
            self.reference = None
        elif tag == 'ul':
            self.in_refs = False


def register_fonts():
    candidates = [
        Path('/System/Library/Fonts/Supplemental/Arial Unicode.ttf'),
        Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
        Path('/usr/local/share/fonts/DejaVuSans.ttf'),
        Path(reportlab.__file__).parent / 'fonts' / 'Vera.ttf',
    ]
    regular = next((p for p in candidates if p.exists()), None)
    if regular is None:
        raise SystemExit('Install a Unicode TrueType font (Arial Unicode or DejaVu Sans).')
    bold_candidates = [
        Path('/System/Library/Fonts/Supplemental/Arial Bold.ttf'),
        Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),
        Path(reportlab.__file__).parent / 'fonts' / 'VeraBd.ttf',
    ]
    bold = next((p for p in bold_candidates if p.exists()), regular)
    pdfmetrics.registerFont(TTFont('Notes', str(regular)))
    pdfmetrics.registerFont(TTFont('NotesBold', str(bold)))
    pdfmetrics.registerFontFamily('Notes', normal='Notes', bold='NotesBold', italic='Notes', boldItalic='NotesBold')
    required = set('γ≥≤↑↓±⁺–→≠')
    supported = pdfmetrics.getFont('Notes').face.charToGlyph
    missing = [c for c in required if ord(c) not in supported]
    if missing:
        raise SystemExit(f'The selected font lacks required characters: {missing}')


INK = colors.HexColor('#24213b')
PURPLE = colors.HexColor('#4f3fb5')
MUTED = colors.HexColor('#666176')
RULE = colors.HexColor('#dfdce9')


class NotesDoc(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark'):
            key, label = flowable.bookmark
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(label, key, level=0)


def page_chrome(canvas, doc):
    w, h = A4
    canvas.saveState()
    canvas.setFillColor(MUTED)
    canvas.setFont('Notes', 8.5)
    canvas.drawString(48, h - 30, 'Autoimmune hepatitis | Speaker notes')
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.6)
    canvas.line(48, h - 40, w - 48, h - 40)
    canvas.line(48, 38, w - 48, 38)
    canvas.drawString(48, 24, 'Shubhayu Ghosh · Shyam K. Saha')
    canvas.drawRightString(w - 48, 24, str(doc.page))
    canvas.restoreState()


def export():
    register_fonts()
    parser = DeckNotes()
    parser.feed((ROOT / 'index.html').read_text())
    assert parser.slides and all(s['notes'] for s in parser.slides)
    main = [s for s in parser.slides if not s['backup']]
    output = ROOT / 'speaker-notes.pdf'
    doc = NotesDoc(
        str(output), pagesize=A4, leftMargin=48, rightMargin=48,
        topMargin=60, bottomMargin=55,
        title='Autoimmune hepatitis — Speaker notes',
        author='Shubhayu Ghosh; Shyam K. Saha',
        subject='Slide-matched notes for an undergraduate medical seminar',
    )
    doc.addPageTemplates(PageTemplate(id='notes', frames=[Frame(48, 55, A4[0]-96, A4[1]-115, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=page_chrome))
    body = ParagraphStyle('Body', fontName='Notes', fontSize=11, leading=16.5,
                          textColor=INK, spaceAfter=12, alignment=TA_LEFT,
                          splitLongWords=True, allowWidows=0, allowOrphans=0)
    title = ParagraphStyle('Title', parent=body, fontName='NotesBold', fontSize=27, leading=33, spaceAfter=14)
    heading = ParagraphStyle('Heading', parent=body, fontName='NotesBold', fontSize=21, leading=27, spaceAfter=18)
    label = ParagraphStyle('Label', parent=body, fontSize=9.5, leading=14, textColor=PURPLE, spaceAfter=8)
    small = ParagraphStyle('Small', parent=body, fontSize=9, leading=13, textColor=MUTED, spaceAfter=7)
    toc_style = ParagraphStyle('TOC', parent=body, fontSize=9.1, leading=13, spaceAfter=0)
    story = [Spacer(1, 10), Paragraph('Autoimmune hepatitis', title),
             Paragraph('Speaker notes', heading),
             Paragraph('Shubhayu Ghosh · Shyam K. Saha', body),
             Paragraph(date.today().strftime('%d %B %Y').lstrip('0'), small),
             Paragraph('Notes correspond to the numbered slides in the revised presentation. Main and supplementary sections are identified separately. PDF bookmarks provide direct navigation to each slide.', body),
             Paragraph(f'<link href="{SITE}" color="#4f3fb5">Open the online presentation</link>', body),
             Spacer(1, 5), Paragraph('Slide index', label)]
    rows = []
    for i, slide in enumerate(parser.slides, 1):
        text = escape(slide['title'])
        rows.append([Paragraph(f'<link href="#slide-{i}" color="#24213b">{i:02d} · {text}</link>', toc_style), Paragraph(str(i+1), toc_style)])
    table = Table(rows, colWidths=[A4[0]-126, 30], hAlign='LEFT')
    table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2),('ALIGN',(1,0),(1,-1),'RIGHT')]))
    story.extend([table, Spacer(1, 10), Paragraph(f'{len(main)} slides in the main sequence (including references); {len(parser.slides)-len(main)} supplementary slides. A reference list follows the notes.', small)])
    for i, slide in enumerate(parser.slides, 1):
        story.append(PageBreak())
        section = 'Supplementary' if slide['backup'] else 'Main presentation'
        story.append(Paragraph(f'{section} · Slide {i:02d}', label))
        p = Paragraph(escape(slide['title']), heading)
        p.bookmark = (f'slide-{i}', f'{i:02d} · {slide["title"]}')
        story.append(p)
        for paragraph in slide['notes']:
            story.append(Paragraph(paragraph, body))
        story.append(Spacer(1, 10))
        story.append(Paragraph(f'<link href="{SITE}#{i}" color="#4f3fb5">Open slide {i} online</link>', small))
    story.append(PageBreak())
    p = Paragraph('Reference links', heading)
    p.bookmark = ('reference-links', 'Reference links')
    story.append(p)
    references = parser.references + [
        {'text':'Hartl et al. Features and outcome of AIH patients without elevation of IgG. JHEP Reports, 2020.', 'url':'https://pmc.ncbi.nlm.nih.gov/articles/PMC7139106/'},
        {'text':'Grønbæk et al. Autoimmune hepatitis in Denmark. Journal of Hepatology 2014;60:612–617.', 'url':'https://pubmed.ncbi.nlm.nih.gov/24326217/'},
    ]
    for ref in references:
        story.append(Paragraph(f'<b>{escape(ref["text"])}</b><br/><link href="{escape(ref["url"], quote=True)}" color="#4f3fb5">{escape(ref["url"])}</link>', small))
    doc.build(story)
    print(f'Exported {len(parser.slides)} slides to {output.name} ({output.stat().st_size:,} bytes).')


if __name__ == '__main__':
    export()
