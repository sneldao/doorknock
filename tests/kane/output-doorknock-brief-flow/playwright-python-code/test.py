import os
import testmu
from testmu import expect, var, set_var
from playwright.async_api import Page

testmu.configure(
    build="f977dab5-5ca8-412e-9d3d-32e1d1cba4d7",
    name="Submit and Verify Meeting Brief",
    tc_id="TC-6",
    network=os.getenv("NETWORK", "false").lower() == "true",
    variables={"brief_masthead_visible": "true", "brief_headline_visible": "true", "key_developments_visible": "true", "development_source_links_present": "true", "discussion_points_visible": "true", "open_questions_visible": "true", "sources_section_visible": "true", "auditor_gateway_verdict_stamp_visible": "true", "brief_fully_renders": "true", "brief_not_fully_rendered": "true"},
    auto_heal_version="AH2",
    default_action_timeout_ms=60000,
    default_navigation_timeout_ms=60000,
    kane_run_v4=True,
)

@testmu.test
async def test(page: Page):
    async with testmu.step('Navigate to https://doorknock-2azp.onrender.com', instruction_id='b69ca65a-f9d9-4d4b-b7f4-9cc377109779'):
        await page.goto("https://doorknock-2azp.onrender.com")
    
    async with testmu.step('Waiting while the next step is queued', instruction_id='27e20b32-680e-4cb5-8e83-dd375bd594fe'):
        await page.wait_for_timeout(1000)
    
    async with testmu.step('Type "Anthropic" into "WHO ARE YOU MEETING? — COMPANY OR PERSON"', instruction_id='b186d8d1-bf2e-4f2a-a93b-e452604810d8'):
        element_0 = page.locator("internal:role=textbox[name=\"Who are you meeting? —\"i]")
        
        await testmu.fill(element_0, "Anthropic")
    
    async with testmu.step('Type "2026-11-18T15:00" into "MEETING TIME"', instruction_id='639f0d04-d940-44dc-abce-794a673950d2'):
        element_1 = page.locator("internal:role=textbox[name=\"Meeting time\"i]")
        
        await testmu.fill(element_1, "2026-11-18T15:00")
    
    async with testmu.step('Selecting meeting type Partnership in the meeting request form', instruction_id='de0cc668-be44-44c6-becf-adc5d61f8d56'):
        element_2 = page.locator("internal:label=\"Meeting typeSales\"i")
        
        await element_2.select_option()
    
    async with testmu.step('Typing in the meeting request form with notes: intro call', instruction_id='51d4161e-a8d7-492a-b4c2-942b1ca2ff3f'):
        element_3 = page.locator("internal:role=textbox[name=\"Anything the crew should know\"i]")
        
        await testmu.fill(element_3, "intro call")
    
    async with testmu.step('Clicking the Knock button', instruction_id='a13ddbe5-a2c8-4d4b-a35e-43cdaee79525'):
        _loc_1 = page.locator("internal:role=button[name=\"Knock\"i]")
        
        await _loc_1.click()
    _condition_met = False
    _until_retries = 0
    while _until_retries < 10:
        print(f"[until-loop] iteration {_until_retries + 1}/10")
        async with testmu.step('Waiting for the agent crew to finish while updates stream by', instruction_id='2e73c63e-9912-4ab8-b8c3-d7ce4ee76937'):
            await page.wait_for_timeout(10000)
        await page.wait_for_timeout(500)
        if await testmu.check_until_condition(page, "the text 'Key developments' is visible"):
            _condition_met = True
            break
        _until_retries += 1
    set_var("__result__", {"condition_met": _condition_met, "retries": _until_retries + 1})
    _condition_met = False
    _until_retries = 0
    while _until_retries < 10:
        print(f"[until-loop] iteration {_until_retries + 1}/10")
        async with testmu.step('Waiting for the agent crew to finish while stages stream by', instruction_id='39f4700c-5b14-4e5f-bec5-2c9596882f5d'):
            await page.wait_for_timeout(10000)
        await page.wait_for_timeout(500)
        if await testmu.check_until_condition(page, "the text 'Key developments' is visible"):
            _condition_met = True
            break
        _until_retries += 1
    set_var("__result__", {"condition_met": _condition_met, "retries": _until_retries + 1})
    
    async with testmu.step('Checking whether the finished brief masthead is present'):
        set_var('brief_masthead_visible', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {10: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (!!(el(10).children[0] && el(10).children[0].innerText.includes('PARTNERSHIP BRIEFING') && el(10).children[0].offsetParent!==null));\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:text="Partnership briefing — Anthropic17 November 2026Anthropic’s imminent IPO and"i'], query='whether the partnership briefing masthead at the top of the finished brief article is present', expected_value='true', needs_unit_conversion=False, operator='equals', transforms=[], condition='The finished brief displays the masthead.'))
    
    async with testmu.step('Checking whether the finished brief headline is present'):
        set_var('brief_headline_visible', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {10: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (!!(el(10).querySelector('h2') && el(10).querySelector('h2').innerText.trim() && el(10).querySelector('h2').offsetParent!==null));\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:text="Partnership briefing — Anthropic17 November 2026Anthropic’s imminent IPO and"i'], query='whether the headline heading near the top of the finished brief article is present', expected_value='true', needs_unit_conversion=False, operator='equals', transforms=[], condition='The finished brief displays the headline.'))
    
    async with testmu.step('Checking whether Key developments is present'):
        set_var('key_developments_visible', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {10: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (!!([...el(10).querySelectorAll('span')].find(x=>x.innerText.includes('KEY DEVELOPMENTS'))?.offsetParent!==null));\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:text="Partnership briefing — Anthropic17 November 2026Anthropic’s imminent IPO and"i'], query='whether the Key developments label in the finished brief article is present', expected_value='true', needs_unit_conversion=False, operator='equals', transforms=[], condition="The finished brief displays 'Key developments'."))
    
    async with testmu.step('Checking source links for every key development'):
        set_var('development_source_links_present', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {10: 0};\n  const el = (i) => els[__m[i]];\n  const __v = ((()=>{const s=[...el(10).querySelectorAll('span')].find(x=>x.innerText.includes('KEY DEVELOPMENTS'));const d=s?.nextElementSibling;return !!(d&&d.children.length&&[...d.children].every(x=>x.querySelectorAll('a[href]').length>0))})());\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:text="Partnership briefing — Anthropic17 November 2026Anthropic’s imminent IPO and"i'], query='whether every development card in the Key developments section has a source link', expected_value='true', needs_unit_conversion=False, operator='equals', transforms=[], condition="Every development in 'Key developments' has source links."))
    
    async with testmu.step('Checking whether Discussion points is present'):
        set_var('discussion_points_visible', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {10: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (!!([...el(10).querySelectorAll('div,span')].find(x=>x.children.length===0&&x.innerText.trim()==='DISCUSSION POINTS')?.offsetParent!==null));\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:text="Partnership briefing — Anthropic17 November 2026Anthropic’s imminent IPO and"i'], query='whether the Discussion points label in the finished brief article is present', expected_value='true', needs_unit_conversion=False, operator='equals', transforms=[], condition="The finished brief displays 'Discussion points'."))
    
    async with testmu.step('Checking whether Open questions is present'):
        set_var('open_questions_visible', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {10: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (!!([...el(10).querySelectorAll('div,span')].find(x=>x.children.length===0&&x.innerText.trim()==='OPEN QUESTIONS')?.offsetParent!==null));\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:text="Partnership briefing — Anthropic17 November 2026Anthropic’s imminent IPO and"i'], query='whether the Open questions label in the finished brief article is present', expected_value='true', needs_unit_conversion=False, operator='equals', transforms=[], condition="The finished brief displays 'Open questions'."))
    
    async with testmu.step('Checking whether the Sources section is present'):
        set_var('sources_section_visible', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {10: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (!!([...el(10).querySelectorAll('span')].find(x=>x.innerText.trim().startsWith('SOURCES ('))?.offsetParent!==null));\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:text="Partnership briefing — Anthropic17 November 2026Anthropic’s imminent IPO and"i'], query='whether the Sources section label in the finished brief article is present', expected_value='true', needs_unit_conversion=False, operator='equals', transforms=[], condition="The finished brief displays the 'Sources' section."))
    
    async with testmu.step('whether the GATEWAY PASS verdict stamp above the finished brief is visible', instruction_id='c74cfe50-4a0b-46af-902a-3d01ea8976ea'):
        set_var('auditor_gateway_verdict_stamp_visible', await testmu.vision_query(page, "whether the GATEWAY PASS verdict stamp above the finished brief is visible", ""))
    
    async with testmu.step('Assertion check', instruction_id='f6bc7fc0-0bd8-48ba-b1c2-659c0b4bf743'):
        await testmu.verify_assertion(page, 'Assertion check', {'operator': ['equals'], 'assertion_operands': [], 'left_operand': None, 'right_operand': None, 'operands': [], 'sub_results': [{'description': 'The finished brief displays the masthead.', 'passed': True, 'operator': 'equals', 'transforms': [], 'json_path': None, 'expected': 'true', 'extracted_value': '{{brief_masthead_visible}}', 'store_key': 'brief_masthead_visible', 'variable_refs': {'{{brief_masthead_visible}}': 'true'}}, {'description': 'The finished brief displays the headline.', 'passed': True, 'operator': 'equals', 'transforms': [], 'json_path': None, 'expected': 'true', 'extracted_value': '{{brief_headline_visible}}', 'store_key': 'brief_headline_visible', 'variable_refs': {'{{brief_headline_visible}}': 'true'}}, {'description': "The finished brief displays 'Key developments'.", 'passed': True, 'operator': 'equals', 'transforms': [], 'json_path': None, 'expected': 'true', 'extracted_value': '{{key_developments_visible}}', 'store_key': 'key_developments_visible', 'variable_refs': {'{{key_developments_visible}}': 'true'}}, {'description': "Every development in 'Key developments' has source links.", 'passed': True, 'operator': 'equals', 'transforms': [], 'json_path': None, 'expected': 'true', 'extracted_value': '{{development_source_links_present}}', 'store_key': 'development_source_links_present', 'variable_refs': {'{{development_source_links_present}}': 'true'}}, {'description': "The finished brief displays 'Discussion points'.", 'passed': True, 'operator': 'equals', 'transforms': [], 'json_path': None, 'expected': 'true', 'extracted_value': '{{discussion_points_visible}}', 'store_key': 'discussion_points_visible', 'variable_refs': {'{{discussion_points_visible}}': 'true'}}, {'description': "The finished brief displays 'Open questions'.", 'passed': True, 'operator': 'equals', 'transforms': [], 'json_path': None, 'expected': 'true', 'extracted_value': '{{open_questions_visible}}', 'store_key': 'open_questions_visible', 'variable_refs': {'{{open_questions_visible}}': 'true'}}, {'description': "The finished brief displays the 'Sources' section.", 'passed': True, 'operator': 'equals', 'transforms': [], 'json_path': None, 'expected': 'true', 'extracted_value': '{{sources_section_visible}}', 'store_key': 'sources_section_visible', 'variable_refs': {'{{sources_section_visible}}': 'true'}}, {'description': 'The finished brief displays the auditor/gateway verdict stamp.', 'passed': True, 'operator': 'equals', 'transforms': [], 'json_path': None, 'expected': 'true', 'extracted_value': '{{auditor_gateway_verdict_stamp_visible}}', 'store_key': 'auditor_gateway_verdict_stamp_visible', 'variable_refs': {'{{auditor_gateway_verdict_stamp_visible}}': 'true'}}], 'sub_checks': [{'description': 'The finished brief displays the masthead.', 'store_key': 'brief_masthead_visible', 'expected_value': 'true', 'extracted_value': '{{brief_masthead_visible}}', 'operator': 'equals', 'transforms': []}, {'description': 'The finished brief displays the headline.', 'store_key': 'brief_headline_visible', 'expected_value': 'true', 'extracted_value': '{{brief_headline_visible}}', 'operator': 'equals', 'transforms': []}, {'description': "The finished brief displays 'Key developments'.", 'store_key': 'key_developments_visible', 'expected_value': 'true', 'extracted_value': '{{key_developments_visible}}', 'operator': 'equals', 'transforms': []}, {'description': "Every development in 'Key developments' has source links.", 'store_key': 'development_source_links_present', 'expected_value': 'true', 'extracted_value': '{{development_source_links_present}}', 'operator': 'equals', 'transforms': []}, {'description': "The finished brief displays 'Discussion points'.", 'store_key': 'discussion_points_visible', 'expected_value': 'true', 'extracted_value': '{{discussion_points_visible}}', 'operator': 'equals', 'transforms': []}, {'description': "The finished brief displays 'Open questions'.", 'store_key': 'open_questions_visible', 'expected_value': 'true', 'extracted_value': '{{open_questions_visible}}', 'operator': 'equals', 'transforms': []}, {'description': "The finished brief displays the 'Sources' section.", 'store_key': 'sources_section_visible', 'expected_value': 'true', 'extracted_value': '{{sources_section_visible}}', 'operator': 'equals', 'transforms': []}, {'description': 'The finished brief displays the auditor/gateway verdict stamp.', 'store_key': 'auditor_gateway_verdict_stamp_visible', 'expected_value': 'true', 'extracted_value': '{{auditor_gateway_verdict_stamp_visible}}', 'operator': 'equals', 'transforms': []}], 'composite_operator': 'and', 'claim': "Verify the finished brief renders completely: masthead, headline, 'Key developments' with source links on every development, 'Discussion points', 'Open questions', 'Sources' section, and the auditor/gateway verdict stamp."})
    
    async with testmu.step('Checking whether the complete briefing article is present'):
        set_var('brief_fully_renders', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {10: 0};\n  const el = (i) => els[__m[i]];\n  const __v = ((()=>{const t=el(10).innerText; return t.includes('PARTNERSHIP BRIEFING')&&t.includes('KEY DEVELOPMENTS')&&t.includes('DISCUSSION POINTS')&&t.includes('OPEN QUESTIONS')&&t.includes('SOURCES (28)')})());\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:text="Partnership briefing — Anthropic17 November 2026Anthropic’s imminent IPO and"i'], query='whether the complete briefing article contains its masthead, key developments, discussion points, open questions, and sources sections', expected_value='true', needs_unit_conversion=False, operator='equals', transforms=[], condition='The brief fully renders.'))
    
    async with testmu.step('Checking whether the complete briefing article is present'):
        set_var('brief_not_fully_rendered', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {10: 0};\n  const el = (i) => els[__m[i]];\n  const __v = ((()=>{const t=el(10).innerText; return t.includes('PARTNERSHIP BRIEFING')&&t.includes('KEY DEVELOPMENTS')&&t.includes('DISCUSSION POINTS')&&t.includes('OPEN QUESTIONS')&&t.includes('SOURCES (28)')})());\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:text="Partnership briefing — Anthropic17 November 2026Anthropic’s imminent IPO and"i'], query='whether the complete briefing article contains its masthead, key developments, discussion points, open questions, and sources sections', expected_value='false', needs_unit_conversion=False, operator='equals', transforms=[], condition='The brief does not fully render.'))
    if await testmu.evaluate_branch(sub_checks=[{'description': 'The brief fully renders.', 'store_key': 'brief_fully_renders', 'expected_value': 'true', 'stored_value': '{{brief_fully_renders}}', 'extracted_value': '{{brief_fully_renders}}', 'operator': 'equals', 'transforms': []}], composite_operator="and"):
        page = await testmu.execute_kane_cli('pass', page=page)
    else:
        page = await testmu.execute_kane_cli('fail naming what is missing', page=page)


if __name__ == "__main__":
    testmu.run(test)