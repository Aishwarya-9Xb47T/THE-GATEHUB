import zipfile

content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>'''

rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''

document_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>'''

for i in range(1, 21):
    document_xml += f'<w:p><w:r><w:t>Question {i}: What is the capital of Country {i}?</w:t></w:r></w:p>'
    document_xml += f'<w:p><w:r><w:t>A) Capital A{i}</w:t></w:r></w:p>'
    document_xml += f'<w:p><w:r><w:t>B) Capital B{i}</w:t></w:r></w:p>'
    document_xml += f'<w:p><w:r><w:t>C) Capital C{i}</w:t></w:r></w:p>'
    document_xml += f'<w:p><w:r><w:t>D) Capital D{i}</w:t></w:r></w:p>'
    document_xml += f'<w:p><w:r><w:t>Answer: A</w:t></w:r></w:p>'
    document_xml += f'<w:p><w:r><w:t>Explanation: Capital A{i} is the capital city.</w:t></w:r></w:p>'

document_xml += '''</w:body></w:document>'''

with zipfile.ZipFile('test_20_mcqs.docx', 'w') as zf:
    zf.writestr('[Content_Types].xml', content_types)
    zf.writestr('_rels/.rels', rels)
    zf.writestr('word/document.xml', document_xml)

print('Generated test_20_mcqs.docx successfully!')
