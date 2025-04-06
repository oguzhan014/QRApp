const express = require('express');
const pool = require('../config/db');
const nodemailer = require('nodemailer');
require('dotenv').config();

const router = express.Router();

// Öğrenci kaydı
router.post('/register', async (req, res) => {
    const { first_name, last_name, student_number, device_id } = req.body;

    if (!first_name || !last_name || !student_number || !device_id) {
        return res.status(400).json({ message: 'Tüm alanlar zorunludur' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO students (first_name, last_name, student_number, device_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [first_name, last_name, student_number, device_id]
        );
        res.status(201).json({ student: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') { // Benzersizlik ihlali (örneğin aynı student_number veya device_id)
            res.status(400).json({ message: 'Bu öğrenci numarası veya cihaz zaten kayıtlı' });
        } else {
            res.status(500).json({ message: 'Kayıt başarısız', error: err.message });
        }
    }
});

// Yoklama kaydı
router.post('/attend', async (req, res) => {
    const { student_id, course_name } = req.body;

    if (!student_id || !course_name) {
        return res.status(400).json({ message: 'student_id ve course_name zorunludur' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO attendances (student_id, course_name) VALUES ($1, $2) RETURNING *',
            [student_id, course_name]
        );
        res.status(201).json({ attendance: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Yoklama kaydedilemedi', details: err.message });
    }
});

// Yoklama listesini mail ile gönderme
router.post('/send-attendance', async (req, res) => {
    const { course_name, date } = req.body;

    if (!course_name || !date) {
        return res.status(400).json({ message: 'course_name ve date zorunludur' });
    }

    try {
        const result = await pool.query(
            'SELECT s.first_name, s.last_name, s.student_number, a.attendance_date ' +
            'FROM attendances a ' +
            'JOIN students s ON a.student_id = s.id ' +
            'WHERE a.course_name = $1 AND DATE(a.attendance_date) = $2',
            [course_name, date]
        );

        const attendanceList = result.rows;

        if (attendanceList.length === 0) {
            return res.status(404).json({ message: 'Bu ders ve tarihe ait yoklama kaydı bulunamadı' });
        }

        // Mail gönderimi
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.TEACHER_EMAIL,
            subject: `${course_name} - ${date} Yoklama Listesi`,
            text: `Yoklama Listesi (${course_name} - ${date}):\n\n` +
                  attendanceList
                      .map(
                          (entry) =>
                              `${entry.first_name} ${entry.last_name} (${entry.student_number}) - ${entry.attendance_date}`
                      )
                      .join('\n'),
        };

        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: 'Yoklama listesi öğretmene gönderildi' });
    } catch (err) {
        res.status(500).json({ error: 'Mail gönderilemedi', details: err.message });
    }
});

module.exports = router;